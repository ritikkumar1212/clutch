"use client";

/* Ephemeral chat (rule 5): live room for the two participants only,
   quick-reply chips, handshake PIN verification, auto-lock notice,
   and the one-tap UPI tip (rule 6, non-custodial). */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, getToken, getUser } from "@/lib/api";
import { ws } from "@/lib/ws";
import { fmtDateTime } from "@/lib/geo";
import { GenderBadge } from "@/components/Badges";
import PinInput from "@/components/PinInput";
import LiveLocationMap from "@/components/LiveLocationMap";
import CallControls from "@/components/CallControls";
import { buildUpiLink } from "@/lib/upi";
import type { ChatMessage, ChatRoom, WsEvents } from "@/lib/types";

interface VerifyResult {
  points_awarded: number;
  helper_total_points: number;
  upi: { vpa: string | null; amount: number };
}

interface MediaMessage {
  url: string;
  name: string;
  mime: string;
}

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [me, setMe] = useState<ReturnType<typeof getUser>>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyErr, setVerifyErr] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pinVisible, setPinVisible] = useState(false);
  const [rewardAmount, setRewardAmount] = useState("");
  const [rewardBusy, setRewardBusy] = useState(false);
  const [rewardError, setRewardError] = useState("");
  const [openSection, setOpenSection] = useState<"map" | "money" | "pin" | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [composerError, setComposerError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    setMe(getUser());
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await api<ChatRoom>(`/chat/${requestId}`);
      setRoom(data);
      setMessages(data.messages);
      completedRef.current = data.status === "completed";
    } catch (err) {
      console.warn(err);
    }
  }, [requestId]);

  useEffect(() => {
    load();
    ws.joinChat(requestId);
    const offMsg = ws.on("chat_message", (p: WsEvents["chat_message"]) => {
      if (p.message.request_id !== requestId) return;
      setMessages((prev) => (prev.some((m) => m.id === p.message.id) ? prev : [...prev, p.message]));
    });
    const offLocked = ws.on("chat_locked", (p: WsEvents["chat_locked"]) => {
      if (p.request_id === requestId) setRoom((r) => (r ? { ...r, archived: true } : r));
    });
    const offCompleted = ws.on("request_completed", (p: WsEvents["request_completed"]) => {
      if (p.request_id === requestId) {
        completedRef.current = true;
        setRoom((r) => (r ? { ...r, status: "completed" } : r));
        // requester hears completion via WS; helper sees full detail after REST refresh
        load();
      }
    });
    const t = setInterval(load, 15000);
    return () => {
      offMsg();
      offLocked();
      offCompleted();
      clearInterval(t);
      ws.leaveChat(requestId);
    };
  }, [requestId, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function send(body: string, kind: "text" | "quick" = "text") {
    if (!body.trim()) return;
    setDraft("");
    try {
      await api(`/chat/${requestId}/messages`, { method: "POST", body: JSON.stringify({ body, kind }) });
    } catch (err) {
      console.warn(err);
    }
  }

  async function uploadFile(file: File) {
    setComposerError("");
    const form = new FormData();
    form.append("file", file);
    try {
      await api(`/chat/${requestId}/uploads`, { method: "POST", body: form });
    } catch (err) {
      setComposerError(err instanceof Error ? err.message : "Could not upload file");
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      audioStreamRef.current?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setComposerError("Voice messages are not supported in this browser");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        const audio = new File([new Blob(chunks, { type: recorder.mimeType })], `voice-${Date.now()}.webm`, {
          type: recorder.mimeType || "audio/webm",
        });
        void uploadFile(audio);
      };
      audioStreamRef.current = stream;
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setComposerError("Microphone permission is required");
    }
  }

  async function saveReward() {
      const amount = Number(rewardAmount);
      if (!Number.isFinite(amount) || amount < 0) {
        setRewardError("Enter a valid amount, or 0 for no cash reward");
        return;
      }
      setRewardBusy(true);
      setRewardError("");
      try {
        const updated = await api<ChatRoom>(`/chat/${requestId}/reward`, {
          method: "POST",
          body: JSON.stringify({ amount }),
        });
        setRoom(updated);
        setMessages(updated.messages);
        setRewardAmount("");
      } catch (err) {
        setRewardError(err instanceof Error ? err.message : "Could not save reward");
      } finally {
        setRewardBusy(false);
    }
  }

  async function revealPin() {
    setPinVisible(true);
    try {
      const res = await api<{ pin: string }>(`/requests/${requestId}/pin`);
      setPin(res.pin); // reuse the PIN boxes to DISPLAY the code for the requester
    } catch {
      setVerifyErr("PIN not available");
    }
  }

  async function verify() {
    setVerifyBusy(true);
    setVerifyErr("");
    try {
      const res = await api<VerifyResult>(`/requests/${requestId}/verify-pin`, {
        method: "POST",
        body: JSON.stringify({ pin }),
      });
      setResult(res);
      await load();
    } catch (err) {
      setVerifyErr(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifyBusy(false);
    }
  }

  if (!room) {
    return (
      <main className="px-4 pt-10">
        <div className="h-64 animate-pulse rounded-2xl bg-panel" />
      </main>
    );
  }

  const isHelper = room.role === "helper";
  const canVerify = isHelper && room.status === "accepted" && !room.archived;
  const chatOpenedMessage = messages.find(
    (message) => message.kind === "system" && message.body.startsWith("Chat opened."),
  );
  return (
    <main className="flex h-[100dvh] flex-col overflow-hidden px-4 pt-1">
      {/* header */}
      <header className="mb-1 flex items-center gap-2 border-b border-line pb-2">
        <Link href="/requests" className="text-muted" aria-label="Back">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-bold">
            <span className="font-mono">@{room.counterpart.handle}</span>
            <GenderBadge gender={room.counterpart.gender} verified={room.counterpart.gender_verified} />
            <span className="text-[10px] font-medium uppercase text-muted">{room.role === "requester" ? "helper" : "you help"}</span>
          </p>
          {room.archived && <p className="text-[11px] text-muted">chat locked for privacy</p>}
        </div>
        {(room.status === "accepted" || room.status === "completed") && (
          <CallControls requestId={requestId} userId={me?.id ?? null} counterpartHandle={room.counterpart.handle} />
        )}
      </header>

      {(room.status === "accepted" || room.status === "completed") && (
        <>
          <div className="mb-3 flex shrink-0 flex-row items-start gap-2">
            <button
              type="button"
              onClick={() => setOpenSection((current) => current === "map" ? null : "map")}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${openSection === "map" ? "border-neon bg-neon/15 text-neon" : "border-line bg-panel text-muted"}`}
              aria-label="Go to live map"
              title="Map"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
                <path d="M9 3v15m6-12v15" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setOpenSection((current) => current === "money" ? null : "money")}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${openSection === "money" ? "border-mint bg-mint/15 text-mint" : "border-line bg-panel text-mint"}`}
              aria-label="Go to money reward"
              title="Money"
            >
              <span className="text-base font-bold">₹</span>
            </button>
            <button
              type="button"
              onClick={() => setOpenSection((current) => current === "pin" ? null : "pin")}
              className={`flex h-9 w-9 items-center justify-center rounded-full border transition active:scale-90 ${openSection === "pin" ? "border-violet bg-violet/15 text-violet" : "border-line bg-panel text-violet"}`}
              aria-label="Go to PIN"
              title="PIN"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="8" cy="15" r="4" />
                <path d="m11 12 8-8m-2 2 2 2m-5 1 2 2" />
              </svg>
            </button>
          </div>
          {openSection === "map" && (
            <LiveLocationMap requestId={requestId} role={room.role} />
          )}
        </>
      )}

      {/* messages */}
      <div className="scroll-thin min-h-0 flex-1 space-y-2 overflow-y-auto py-2">
        {messages.map((m) => {
          if (m.kind === "system") {
            if (m.body.startsWith("Chat opened.")) return null;
            return (
              <p key={m.id} className="mx-auto max-w-[85%] rounded-xl bg-white/5 px-3 py-1.5 text-center text-[11px] leading-relaxed text-muted">
                {m.body}
                <span className="mt-1 block text-[9px] opacity-70">{fmtDateTime(m.created_at)}</span>
              </p>
            );
          }
          const mine = m.sender_id === me?.id;
          if (m.kind === "attachment" || m.kind === "audio") {
            let media: MediaMessage | null = null;
            try {
              media = JSON.parse(m.body) as MediaMessage;
            } catch {
              media = null;
            }
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 ${mine ? "bg-neon text-ink" : "bg-panel2 text-slate-200"}`}>
                  {media && m.kind === "audio" && <audio controls src={media.url} className="max-w-full" />}
                  {media && m.kind === "attachment" && media.mime.startsWith("image/") && (
                    <a href={media.url} target="_blank" rel="noreferrer">
                      <img src={media.url} alt={media.name} className="max-h-56 rounded-lg object-cover" />
                    </a>
                  )}
                  {media && m.kind === "attachment" && !media.mime.startsWith("image/") && (
                    <a href={media.url} target="_blank" rel="noreferrer" className="text-sm underline">{media.name}</a>
                  )}
                  <span className="ml-2 text-[9px] text-muted">{fmtDateTime(m.created_at)}</span>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-snug ${
                  mine
                    ? "rounded-br-md bg-neon text-ink"
                    : m.kind === "quick"
                      ? "rounded-bl-md bg-violet/20 text-violet"
                      : "rounded-bl-md bg-panel2 text-slate-200"
                }`}
              >
                {m.body}
                <span className={`ml-2 align-bottom text-[9px] ${mine ? "text-ink/60" : "text-muted"}`}>
                  {fmtDateTime(m.created_at)}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* completion / verification panel */}
      {room.status === "completed" && !result && !isHelper && (
        <div className="mb-2 rounded-2xl border border-mint/40 bg-mint/10 p-4 text-center">
          <p className="text-sm font-black text-mint">Meeting verified — task complete</p>
          {Number(room.tip_amount) > 0 && (
            <UpiFooter requestId={requestId} amount={Number(room.tip_amount)} />
          )}
        </div>
      )}
      {result && (
        <div className="mb-2 rounded-2xl border border-mint/40 bg-mint/10 p-4 text-center">
          <p className="text-sm font-black text-mint">
            Verified! +{result.points_awarded} Help Points (total {result.helper_total_points})
          </p>
          <p className="mt-1 text-[11px] text-muted">Chat auto-locks 30 minutes after completion.</p>
          {result.upi?.vpa && result.upi.amount > 0 && <UpiLinkInline vpa={result.upi.vpa} amount={result.upi.amount} requestId={requestId} />}
        </div>
      )}
      {canVerify && openSection === "pin" && (
        <div className="mb-2 rounded-xl border border-violet/40 bg-violet/10 p-3">
          <p className="text-center text-[11px] font-semibold text-violet">Ask for the 4-digit PIN when you meet</p>
          <div className="mt-2">
            <PinInput value={pin} onChange={setPin} />
          </div>
          {verifyErr && <p className="mt-2 text-center text-xs text-danger">{verifyErr}</p>}
          <button
            onClick={verify} disabled={verifyBusy || pin.length !== 4}
            className="mt-2 w-full rounded-lg bg-violet py-2.5 text-sm font-black text-white transition active:scale-95 disabled:opacity-40"
          >
            {verifyBusy ? "Verifying…" : "Verify & complete (+10 base pts)"}
          </button>
        </div>
      )}
      {/* requester PIN reveal */}
      {room.role === "requester" && room.status === "accepted" && openSection === "pin" && (
        <div className="mb-2 rounded-xl border border-violet/40 bg-violet/10 p-3 text-center">
          <p className="text-[11px] font-semibold text-violet">Show this PIN when you meet</p>
          {!pinVisible ? (
            <button onClick={revealPin} className="mt-2 rounded-lg bg-violet px-4 py-2 text-sm font-black text-white active:scale-95">
              Reveal PIN
            </button>
          ) : (
            <p className="mt-1 text-3xl font-black tracking-[0.4em] text-violet">{pin}</p>
          )}
        </div>
      )}
      {room.archived && (
        <p className="mb-2 rounded-xl bg-white/5 px-3 py-2.5 text-center text-xs text-muted">
          This chat was locked for privacy 30 minutes after completion.
        </p>
      )}

      {!room.archived && room.status === "accepted" && openSection === "money" && (
        <div className="mb-2 rounded-xl border border-line bg-panel p-2.5">
          <p className="text-[11px] font-semibold text-muted">Optional cash reward</p>
          <div className="mt-1.5 flex gap-2">
            <div className="flex flex-1 items-center rounded-xl border border-line bg-panel2 px-3">
              <span className="text-sm font-bold text-mint">₹</span>
              <input
                value={rewardAmount}
                onChange={(event) => setRewardAmount(event.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                placeholder={room.tip_amount > 0 ? `Agreed: ₹${Number(room.tip_amount).toFixed(0)}` : "Cash amount (optional)"}
                aria-label="Negotiated cash reward"
                className="w-full bg-transparent py-2 pl-1.5 text-sm focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={saveReward}
              disabled={rewardBusy || !rewardAmount}
              className="rounded-lg border border-mint/40 px-3 text-xs font-bold text-mint disabled:opacity-40"
            >
              {rewardBusy ? "Saving…" : "Set cash"}
            </button>
          </div>
          {room.tip_amount > 0 && <p className="mt-1 text-[11px] text-mint">Agreed cash reward: ₹{Number(room.tip_amount).toFixed(0)}</p>}
          {rewardError && <p className="mt-1 text-[11px] text-danger">{rewardError}</p>}
        </div>
      )}

      {chatOpenedMessage && (
        <p className="mb-2 rounded-xl bg-white/5 px-3 py-1.5 text-center text-[11px] leading-relaxed text-muted">
          {chatOpenedMessage.body}
        </p>
      )}

      {/* composer */}
      {!room.archived && room.status !== "expired" && room.status !== "cancelled" && (
        <div className="safe-bottom shrink-0 border-t border-line bg-ink py-2">
          {emojiOpen && (
            <div className="mb-2 grid grid-cols-8 gap-1 rounded-xl border border-line bg-panel p-2">
              {["😀", "😂", "❤️", "👍", "🙏", "🙂", "😅", "🎉", "📍", "🚗", "✅", "🤝", "😄", "😎", "🙌", "💯"].map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  onClick={() => {
                    setDraft((current) => current + emoji);
                    setEmojiOpen(false);
                  }}
                  className="rounded-lg py-1 text-lg transition hover:bg-panel2 active:scale-90"
                  aria-label={`Add ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {composerError && <p className="mb-1 text-center text-[11px] text-danger">{composerError}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex items-center gap-2 rounded-full bg-panel px-2 py-1"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf,.txt"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadFile(file);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-90"
              aria-label="Attach photo or file"
              title="Attach photo or file"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="m20.5 11.5-8.8 8.8a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.4-8.4" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setEmojiOpen((open) => !open)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-90"
              aria-label="Open emoji picker"
              title="Emoji"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="12" cy="12" r="8.5" />
                <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" />
                <circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" />
                <path d="M8.5 14c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2" />
              </svg>
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={recording ? "Recording voice…" : "Type a message"}
              className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-sm placeholder:text-muted/60 focus:outline-none"
            />
            <button
              type={draft.trim() ? "submit" : "button"}
              onClick={draft.trim() ? undefined : toggleRecording}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-90 ${recording ? "bg-danger text-white" : "bg-neon text-ink"}`}
              aria-label={draft.trim() ? "Send" : recording ? "Stop recording" : "Record voice message"}
            >
              {draft.trim() ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="m3 20 18-8L3 4v6l12 2-12 2v6Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="9" y="3" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-3 0h6" />
                </svg>
              )}
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function UpiLinkInline({ vpa, amount, requestId }: { vpa: string; amount: number; requestId: string }) {
  const link = buildUpiLink(vpa, amount, `CampusRadar tip ${requestId.slice(0, 8)}`, "CampusRadar Helper");
  return (
    <a
      href={link.href}
      className="mt-3 inline-block w-full rounded-xl bg-mint px-4 py-3 text-sm font-black text-ink transition active:scale-95"
    >
      Pay ₹{amount.toFixed(0)} via UPI → {link.vpa}
    </a>
  );
}

function UpiFooter({ requestId, amount }: { requestId: string; amount: number }) {
  const [vpa, setVpa] = useState<string | null>(null);
  useEffect(() => {
    api<{ helper_upi_vpa?: string | null }>(`/requests/${requestId}`)
      .then((r) => setVpa(r.helper_upi_vpa ?? null))
      .catch(() => setVpa(null));
  }, [requestId]);
  if (!vpa) {
    return (
      <p className="mt-2 text-[11px] text-muted">
        Cash reward ₹{amount.toFixed(0)} — the helper&apos;s UPI ID appears here for one-tap payment.
      </p>
    );
  }
  return <UpiLinkInline vpa={vpa} amount={amount} requestId={requestId} />;
}
