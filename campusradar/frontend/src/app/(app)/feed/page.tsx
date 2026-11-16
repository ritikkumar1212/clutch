"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RequestCard from "@/components/RequestCard";
import { api, getUser, updateUser } from "@/lib/api";
import { ws } from "@/lib/ws";
import type { RequestCard as Card, User, WsEvents } from "@/lib/types";

export default function FeedPage() {
  const router = useRouter();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [online, setOnline] = useState<number | null>(null);
  const [points, setPoints] = useState(getUser()?.help_points ?? 0);
  const removed = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await api<Card[]>("/requests/feed");
      setItems(data.filter((request) => !removed.current.has(request.id)));
    } catch {
      // Keep the current feed visible while briefly offline.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    api<User>("/users/me").then((user) => {
      setPoints(user.help_points);
      updateUser(user);
    }).catch(() => {});
    const poll = setInterval(load, 15000);
    const ping = setInterval(() => ws.ping(), 10000);
    const offPong = ws.on("pong", (event: WsEvents["pong"]) => setOnline(event.online_users));
    ws.ping();

    const offNew = ws.on("new_request", (event: WsEvents["new_request"]) => {
      setItems((current) => current.some((request) => request.id === event.request.id) || removed.current.has(event.request.id)
        ? current
        : [event.request, ...current]);
      setToast("New ping on campus");
      setTimeout(() => setToast(""), 2500);
    });
    const remove = (requestId: string) => {
      removed.current.add(requestId);
      setItems((current) => current.filter((request) => request.id !== requestId));
    };
    const offRemoved = ws.on("feed_removed", (event: WsEvents["feed_removed"]) => remove(event.request_id));
    const offExpired = ws.on("request_expired", (event: WsEvents["request_expired"]) => remove(event.request_id));
    return () => {
      clearInterval(poll);
      clearInterval(ping);
      offPong();
      offNew();
      offRemoved();
      offExpired();
    };
  }, [load]);

  async function accept(id: string) {
    setBusy(id);
    try {
      await api(`/requests/${id}/accept`, { method: "POST" });
      router.push(`/chat/${id}`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not accept this ping");
      setTimeout(() => setToast(""), 3000);
      removed.current.add(id);
      setItems((current) => current.filter((request) => request.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="px-4 pb-5 pt-2">
      <header className="flex items-center justify-between">
        <div className="brand-wordmark">Clutch</div>
        <span className="verified-pill"><span>♧</span> Campus verified</span>
      </header>

      <section className="mt-8">
        <h1 className="text-[30px] font-black leading-[1.05] tracking-[-0.06em] text-[#f5ede7]">Your campus.<br />Your backup.</h1>
        <p className="mt-2 text-sm text-muted">A little help goes a long way.</p>
      </section>

      <section className="mt-6 rounded-[20px] bg-neon p-4 text-ink shadow-[0_14px_30px_rgba(242,198,163,.12)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black tracking-[0.14em]">GOOD KARMA, REAL PERKS</p>
            <p className="mt-2 text-lg font-black tracking-tight">Every favour counts.</p>
            <p className="mt-1 text-[11px] font-semibold text-ink/65">Stack points for campus perks.</p>
          </div>
          <span className="rounded-full bg-ink px-3 py-1.5 text-xs font-black text-neon">{points} pts</span>
        </div>
      </section>

      <section className="mt-7">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="section-title">Clutch Feed</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 rounded-full bg-mint" />{online ?? 0} pings live on campus</p>
          </div>
          <button type="button" className="grid h-10 w-10 place-items-center rounded-[14px] border border-line text-muted" aria-label="Feed info">ⓘ</button>
        </div>

        <div className="mt-4 rounded-[18px] border border-mint/20 bg-mint/10 px-4 py-3">
          <p className="text-xs font-black text-mint">♧ Clutch Guard is on</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[#c7d3c9]">Only campus-verified pings appear here. Your live location stays private.</p>
        </div>

        {toast && <div className="mt-3 rounded-xl border border-neon/30 bg-neon/10 px-3 py-2 text-xs font-bold text-neon">{toast}</div>}

        {loading ? (
          <div className="mt-4 space-y-3">{[0, 1].map((item) => <div key={item} className="h-48 animate-pulse rounded-[21px] bg-panel" />)}</div>
        ) : items.length === 0 ? (
          <div className="surface mt-4 px-5 py-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-panel2 text-2xl text-neon">♧</div>
            <p className="mt-4 text-sm font-bold">No pings right now.</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">Keep Clutch open. New campus requests will land here live.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map((request) => <RequestCard key={request.id} req={request} variant="feed" busy={busy === request.id} onAccept={accept} />)}
          </div>
        )}
      </section>
    </main>
  );
}
