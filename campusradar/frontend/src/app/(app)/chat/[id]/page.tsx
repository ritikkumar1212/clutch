"use client";

/* Ephemeral chat (rule 5): live room for the two participants only,
   quick-reply chips, handshake PIN verification, auto-lock notice,
   and the one-tap UPI tip (rule 6, non-custodial). */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, getToken, getUser } from "@/lib/api";
import { ws } from "@/lib/ws";
import { fmtClock } from "@/lib/geo";
import { QUICK_REPLIES, categoryOf } from "@/lib/categories";
import { GenderBadge } from "@/components/Badges";
import PinInput from "@/components/PinInput";
import { buildUpiLink } from "@/lib/upi";
import type { ChatMessage, ChatRoom, WsEvents } from "@/lib/types";

interface VerifyResult {
  points_awarded: number;
  helper_total_points: number;
  upi: { vpa: string | null; amount: number };
}

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const requestId = params.id;
  const me = typeof window !== "undefined" ? getUser() : null;

  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [catId, setCatId] = useState<string>("errand");
  const [draft, setDraft] = useState("");
  const [pin, setPin] = useState("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyErr, setVerifyErr] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [pinVisible, setPinVisible] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

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

  /* category for the header chip (best-effort — chat still works without it) */
  useEffect(() => {
    api<{ category: string }>(`/requests/${requestId}`)
      .then((r) => setCatId(r.category))
      .catch(() => {});
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
  const cat = categoryOf(catId);

  return (
    <main className="flex min-h-screen flex-col px-4 pt-2">
      {/* header */}
      <header className="mb-2 flex items-center gap-3 border-b border-line pb-3">
        <Link href={isHelper ? "/requests" : "/requests"} className="text-muted" aria-label="Back">
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
          <p className="text-[11px] text-muted">
            {room.archived
              ? "chat locked for privacy"
              : room.status === "completed"
                ? "verified meeting"
                : room.status === "accepted"
                  ? "coordinate, meet, then verify PIN"
                  : room.status}
          </p>
        </div>
        <span className={`grid h-8 w-8 place-items-center rounded-lg bg-white/5 ${cat.color}`}>{cat.icon}</span>
      </header>

      {/* messages */}
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto py-3" style={{ maxHeight: "calc(100vh - 330px)" }}>
        {messages.map((m) => {
          if (m.kind === "system") {
            return (
              <p key={m.id} className="mx-auto max-w-[85%] rounded-xl bg-white/5 px-3 py-1.5 text-center text-[11px] leading-relaxed text-muted">
                {m.body}
              </p>
            );
          }
          const mine = m.sender_id === me?.id;
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
                  {fmtClock(m.created_at)}
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
      {canVerify && (
        <div className="mb-2 rounded-2xl border border-violet/40 bg-violet/10 p-4">
          <p className="text-center text-xs font-semibold text-violet">
            Ask {room.role === "helper" ? "the requester" : ""} for their 4-digit PIN when you meet
          </p>
          <div className="mt-3">
            <PinInput value={pin} onChange={setPin} />
          </div>
          {verifyErr && <p className="mt-2 text-center text-xs text-danger">{verifyErr}</p>}
          <button
            onClick={verify} disabled={verifyBusy || pin.length !== 4}
            className="mt-3 w-full rounded-xl bg-violet py-3 text-sm font-black text-white transition active:scale-95 disabled:opacity-40"
          >
            {verifyBusy ? "Verifying…" : "Verify & complete (+10 base pts)"}
          </button>
        </div>
      )}
      {/* requester PIN reveal */}
      {room.role === "requester" && room.status === "accepted" && (
        <div className="mb-2 rounded-2xl border border-violet/40 bg-violet/10 p-4 text-center">
          <p className="text-xs font-semibold text-violet">Your handshake PIN — show it to the helper when you meet</p>
          {!pinVisible ? (
            <button onClick={revealPin} className="mt-2 rounded-xl bg-violet px-5 py-2.5 text-sm font-black text-white active:scale-95">
              Reveal PIN
            </button>
          ) : (
            <p className="mt-1 text-4xl font-black tracking-[0.5em] text-violet">{pin}</p>
          )}
        </div>
      )}
      {room.archived && (
        <p className="mb-2 rounded-xl bg-white/5 px-3 py-2.5 text-center text-xs text-muted">
          This chat was locked for privacy 30 minutes after completion.
        </p>
      )}

      {/* quick replies + composer */}
      {!room.archived && room.status !== "expired" && room.status !== "cancelled" && (
        <div className="safe-bottom pb-2">
          <div className="scroll-thin mb-2 flex gap-2 overflow-x-auto pb-1">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q}
                onClick={() => send(q, "quick")}
                className="shrink-0 rounded-full border border-violet/40 bg-violet/10 px-3.5 py-1.5 text-xs font-semibold text-violet active:scale-95"
              >
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="flex gap-2"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Message…"
              className="flex-1 rounded-xl border border-line bg-panel px-4 py-3 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
            />
            <button
              type="submit" disabled={!draft.trim()}
              className="rounded-xl bg-neon px-5 text-sm font-black text-ink transition active:scale-95 disabled:opacity-40"
              aria-label="Send"
            >
              Send
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
        Tip ₹{amount.toFixed(0)} — the helper&apos;s UPI ID appears here for one-tap payment.
      </p>
    );
  }
  return <UpiLinkInline vpa={vpa} amount={amount} requestId={requestId} />;
}
