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
  const [points, setPoints] = useState(0);
  const [toast, setToast] = useState("");
  const removed = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await api<Card[]>("/requests/feed");
      setItems(data.filter((request) => !removed.current.has(request.id)));
    } catch {
      // Keep the last feed snapshot while the API is unavailable.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    setPoints(getUser()?.help_points ?? 0);
    api<User>("/users/me").then((user) => { setPoints(user.help_points); updateUser(user); }).catch(() => {});
    const poll = setInterval(load, 15000);
    const offNew = ws.on("new_request", (event: WsEvents["new_request"]) => {
      setItems((current) => current.some((request) => request.id === event.request.id) || removed.current.has(event.request.id) ? current : [event.request, ...current]);
      setToast("New ping on campus");
      setTimeout(() => setToast(""), 2500);
    });
    const remove = (requestId: string) => { removed.current.add(requestId); setItems((current) => current.filter((request) => request.id !== requestId)); };
    const offRemoved = ws.on("feed_removed", (event: WsEvents["feed_removed"]) => remove(event.request_id));
    const offExpired = ws.on("request_expired", (event: WsEvents["request_expired"]) => remove(event.request_id));
    return () => { clearInterval(poll); offNew(); offRemoved(); offExpired(); };
  }, [load]);

  async function accept(id: string) {
    setBusy(id);
    try { await api(`/requests/${id}/accept`, { method: "POST" }); router.push(`/chat/${id}`); }
    catch (error) { setToast(error instanceof Error ? error.message : "Could not accept this ping"); setTimeout(() => setToast(""), 3000); removed.current.add(id); setItems((current) => current.filter((request) => request.id !== id)); }
    finally { setBusy(null); }
  }

  return (
    <main className="px-4 pb-4 pt-2">
      <header className="pt-4">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold tracking-tight text-ambertint-soft">Clutch</h1>
          <span className="chip bg-emeraldtint-glow px-3 py-1.5 text-emeraldtint-muted">♧ Campus verified</span>
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold leading-tight">Right on time, everytime.</h2>
        <p className="mt-1 text-sm text-mist-dim">A little help goes a long way.</p>
      </header>

      <section className="mt-5 flex items-center justify-between rounded-2xl bg-ambertint-soft px-4 py-3 text-ink-950">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">Good karma, real perks</p>
          <p className="mt-1 font-display text-lg font-bold">Every favour counts.</p>
          <p className="mt-0.5 text-[11px] opacity-70">Stack points for campus perks.</p>
        </div>
        <span className="rounded-full bg-ink-800 px-3 py-2 text-xs font-bold text-ambertint-soft">{points} pts</span>
      </section>

      <section className="pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight">Clutch Feed</h2>
            <p className="flex items-center gap-1.5 text-xs text-mist-dim"><span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping-slow rounded-full bg-emeraldtint-muted" /><span className="relative h-2 w-2 rounded-full bg-emeraldtint-muted" /></span>{items.length} pings live on campus</p>
          </div>
          <button type="button" className="btn-ghost px-3 py-2" aria-label="Feed info">ⓘ</button>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emeraldtint-muted/20 bg-emeraldtint-glow p-3.5">
          <span className="mt-0.5 shrink-0 text-emeraldtint-muted">♧</span>
          <div><p className="text-xs font-bold text-mist">Clutch Guard is on</p><p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">Only campus-verified pings appear here. Your live location stays private.</p></div>
        </div>

        {toast && <div className="mt-3 rounded-xl border border-ambertint-soft/30 bg-ambertint-glow px-3 py-2 text-xs font-semibold text-ambertint-soft">{toast}</div>}
        {loading ? <div className="mt-4 space-y-3">{[0, 1].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-ink-850" />)}</div> : items.length === 0 ? <div className="card mt-4 px-5 py-12 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink-700 text-2xl text-ambertint-soft">♧</div><p className="mt-4 text-sm font-bold">No pings right now.</p><p className="mt-1 text-xs leading-relaxed text-mist-dim">Keep Clutch open. New campus requests will land here live.</p></div> : <div className="mt-4 space-y-3">{items.map((request) => <RequestCard key={request.id} req={request} variant="feed" busy={busy === request.id} onAccept={accept} />)}</div>}
      </section>
    </main>
  );
}
