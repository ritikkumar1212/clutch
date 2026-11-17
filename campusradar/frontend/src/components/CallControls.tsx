"use client";

import { useEffect, useRef, useState } from "react";
import { ws } from "@/lib/ws";
import type { WsEvents } from "@/lib/types";

type CallKind = "audio" | "video";
type CallStatus = "idle" | "calling" | "incoming" | "connected";

interface Props {
  requestId: string;
  userId: string | null;
  counterpartHandle: string;
}

export default function CallControls({ requestId, userId, counterpartHandle }: Props) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [kind, setKind] = useState<CallKind>("audio");
  const [incomingKind, setIncomingKind] = useState<CallKind>("audio");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [callError, setCallError] = useState("");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null);
  const pendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const answerApplyingRef = useRef(false);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const video = remoteVideoRef.current;
    const audio = remoteAudioRef.current;
    if (video) {
      video.srcObject = remoteStream;
      if (remoteStream) void video.play().catch(() => undefined);
    }
    if (audio) {
      audio.srcObject = remoteStream;
      if (remoteStream) void audio.play().catch(() => setCallError("Tap the call panel once to enable call audio."));
    }
  }, [remoteStream]);

  function closePeer() {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setRemoteStream(null);
    setStatus("idle");
    pendingOfferRef.current = null;
    pendingIceRef.current = [];
    answerApplyingRef.current = false;
  }

  async function applyRemoteDescription(peer: RTCPeerConnection, description: RTCSessionDescriptionInit) {
    await peer.setRemoteDescription(description);
    const pending = pendingIceRef.current.splice(0);
    for (const candidate of pending) await peer.addIceCandidate(candidate);
  }

  async function createPeer(callKind: CallKind) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callKind === "video",
    });
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    peer.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      setRemoteStream(stream);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("connected");
      if (peer.connectionState === "failed") {
        closePeer();
        setCallError("Call connection failed. Check both users' network and permissions.");
      }
    };
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        ws.emit({ type: "call_signal", request_id: requestId, signal: "ice", data: event.candidate.toJSON() });
      }
    };
    peerRef.current = peer;
    localStreamRef.current = stream;
    return peer;
  }

  async function startCall(callKind: CallKind) {
    try {
      setCallError("");
      setKind(callKind);
      setStatus("calling");
      const peer = await createPeer(callKind);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      ws.emit({
        type: "call_signal",
        request_id: requestId,
        signal: "offer",
        data: { kind: callKind, description: offer },
      });
    } catch {
      closePeer();
      setCallError("Could not start the call. Allow microphone access and try again.");
    }
  }

  async function acceptCall() {
    const offer = pendingOfferRef.current;
    if (!offer) return;
    try {
      setCallError("");
      setKind(incomingKind);
      setStatus("calling");
      const peer = await createPeer(incomingKind);
      await applyRemoteDescription(peer, offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      ws.emit({ type: "call_signal", request_id: requestId, signal: "answer", data: answer });
      setStatus("connected");
    } catch {
      closePeer();
      setCallError("Could not accept the call. Please try again.");
    }
  }

  useEffect(() => {
    const off = ws.on("call_signal", async (event: WsEvents["call_signal"]) => {
      if (event.request_id !== requestId || event.sender_id === userId) return;
      if (event.signal === "hangup") {
        closePeer();
        return;
      }
      if (event.signal === "offer") {
        const data = event.data as { kind?: CallKind; description?: RTCSessionDescriptionInit } | undefined;
        if (!data?.description || status !== "idle") return;
        pendingOfferRef.current = data.description;
        setIncomingKind(data.kind === "video" ? "video" : "audio");
        setStatus("incoming");
      } else if (event.signal === "answer" && peerRef.current) {
        const peer = peerRef.current;
        // A call answer is valid only once, while the caller has a local offer.
        // Redis/WebSocket reconnects can deliver the same answer more than once.
        if (peer.signalingState !== "have-local-offer" || answerApplyingRef.current) return;
        answerApplyingRef.current = true;
        try {
          await applyRemoteDescription(peer, event.data as RTCSessionDescriptionInit);
          setStatus("connected");
        } catch {
          // Ignore a late duplicate that arrived after the first answer changed
          // the peer back to stable; surface only genuine negotiation failures.
          const stateAfterError = peer.signalingState as RTCSignalingState;
          if (stateAfterError !== "stable") {
            setCallError("The call answer could not be applied. Please call again.");
            closePeer();
          }
        }
      } else if (event.signal === "ice" && event.data) {
        const candidate = event.data as RTCIceCandidateInit;
        if (peerRef.current?.remoteDescription) {
          try {
            await peerRef.current.addIceCandidate(candidate);
          } catch {
            pendingIceRef.current.push(candidate);
          }
        } else {
          pendingIceRef.current.push(candidate);
        }
      }
    });
    return off;
  }, [requestId, userId, status]);

  function hangup() {
    ws.emit({ type: "call_signal", request_id: requestId, signal: "hangup" });
    closePeer();
  }

  return (
    <>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={() => void startCall("audio")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:scale-90" aria-label="Start audio call">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M6.5 4.5 9 4l2 5-2 1.5a13 13 0 0 0 4.5 4.5L15 13l5 2 .5 2.5a2 2 0 0 1-2.2 2.4C10.7 18.8 5.2 13.3 4.1 5.7A2 2 0 0 1 6.5 4.5Z" />
          </svg>
        </button>
        <button type="button" onClick={() => void startCall("video")} className="flex h-8 w-8 items-center justify-center rounded-full text-muted active:scale-90" aria-label="Start video call">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="6" width="13" height="12" rx="2" />
            <path d="m16 10 5-3v10l-5-3" />
          </svg>
        </button>
      </div>
      {callError && <p className="fixed inset-x-4 top-16 z-50 mx-auto max-w-md rounded-xl border border-danger/40 bg-panel px-3 py-2 text-center text-xs text-danger">{callError}</p>}
      {status === "incoming" && (
        <div className="fixed inset-x-4 top-16 z-50 mx-auto max-w-md rounded-2xl border border-line bg-panel p-4 shadow-2xl">
          <p className="text-sm font-bold">@{counterpartHandle} is calling</p>
          <p className="mt-1 text-xs text-muted">{incomingKind === "video" ? "Video call" : "Audio call"}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={hangup} className="flex-1 rounded-xl bg-danger py-2 text-sm font-bold text-white">Decline</button>
            <button type="button" onClick={() => void acceptCall()} className="flex-1 rounded-xl bg-mint py-2 text-sm font-bold text-ink">Accept</button>
          </div>
        </div>
      )}
      {status !== "idle" && status !== "incoming" && (
        <div className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md rounded-2xl border border-line bg-panel p-3 shadow-2xl">
          {kind === "video" && <video ref={remoteVideoRef} autoPlay playsInline className="mb-2 max-h-64 w-full rounded-xl bg-ink" />}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{status === "calling" ? "Calling…" : "Connected"}</span>
            {kind === "audio" && <audio ref={remoteAudioRef} autoPlay playsInline />}
            <button type="button" onClick={hangup} className="rounded-full bg-danger px-4 py-2 text-xs font-bold text-white">End call</button>
          </div>
        </div>
      )}
    </>
  );
}
