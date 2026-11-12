"use client";

/* Incoming request feed — only items the SERVER targeted to this user.
   Female-only requests never reach male users (rule 4: enforced backend-side). */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import RequestCard from "@/components/RequestCard";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import type { RequestCard as Card, WsEvents } from "@/lib/types";

export default function FeedPage() {
  const router = useRouter();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string>("");
  const removed = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await api<Card[]>("/requests/feed");
      setItems(data.filter((r) => !removed.current.has(r.id)));
    } catch {
      /* offline — keep showing what we have */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // safety poll; WS is the live path

    const offNew = ws.on("new_request", (p: WsEvents["new_request"]) => {
      setItems((prev) =>
        prev.some((x) => x.id === p.request.id) || removed.current.has(p.request.id)
          ? prev
          : [p.request, ...prev]
      );
      setToast("New request nearby!");
      setTimeout(() => setToast(""), 2500);
    });
    const offRemoved = ws.on("feed_removed", (p: WsEvents["feed_removed"]) => {
      removed.current.add(p.request_id);
      setItems((prev) => prev.filter((x) => x.id !== p.request_id));
    });
    const offExpired = ws.on("request_expired", (p: WsEvents["request_expired"]) => {
      removed.current.add(p.request_id);
      setItems((prev) => prev.filter((x) => x.id !== p.request_id));
    });

    return () => {
      clearInterval(t);
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
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not accept");
      setTimeout(() => setToast(""), 3000);
      removed.current.add(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="px-4 pt-2">
      <header className="mb-3">
        <h1 className="text-lg font-black tracking-tight">Help requests near you</h1>
        <p className="text-[11px] text-muted">
          Matched by your live location — you&apos;ll never see another student&apos;s coordinates
        </p>
      </header>

      {toast && (
        <div className="mb-3 rounded-xl border border-neon/40 bg-neon/10 px-3 py-2 text-xs font-semibold text-neon">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-panel" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-3 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-3xl bg-panel">
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 12l5-3.5" /><circle cx="12" cy="12" r="1" fill="currentColor" />
            </svg>
          </div>
          <p className="max-w-[240px] text-sm text-muted">
            No matching requests right now. Keep the app open — matching helpers are pinged the moment a request drops.
          </p>
        </div>
      ) : (
        <div className="space-y-3 pb-4">
          {items.map((r) => (
            <RequestCard key={r.id} req={r} variant="feed" busy={busy === r.id} onAccept={accept} />
          ))}
        </div>
      )}
    </main>
  );
}
