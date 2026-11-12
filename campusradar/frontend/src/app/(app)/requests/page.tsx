"use client";

/* My Requests: "created" (with live viewer counter + handshake PIN) and
   "helping" (chat / verify entry points). */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";
import { GenderBadge } from "@/components/Badges";
import ViewerCounter from "@/components/ViewerCounter";
import type { RequestCard as Card, WsEvents } from "@/lib/types";

interface Mine {
  created: Card[];
  helping: Card[];
}

function statusChip(status: string) {
  const map: Record<string, string> = {
    open: "bg-neon/15 text-neon",
    accepted: "bg-violet/15 text-violet",
    completed: "bg-mint/15 text-mint",
    expired: "bg-white/10 text-muted",
    cancelled: "bg-white/10 text-muted",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${map[status] || map.expired}`}>
      {status}
    </span>
  );
}

export default function RequestsPage() {
  const [mine, setMine] = useState<Mine>({ created: [], helping: [] });
  const [loading, setLoading] = useState(true);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [showPin, setShowPin] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMine(await api<Mine>("/requests/mine"));
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    const handlers = [
      ws.on("viewer_count", (p: WsEvents["viewer_count"]) =>
        setMine((m) => ({
          ...m,
          created: m.created.map((r) => (r.id === p.request_id ? { ...r, viewer_count: p.count } : r)),
        }))
      ),
      ws.on("request_locked", (p: WsEvents["request_locked"]) =>
        setMine((m) => ({
          ...m,
          created: m.created.map((r) => (r.id === p.request_id ? { ...r, status: "accepted" as const, helper: p.helper } : r)),
        }))
      ),
      ws.on("request_completed", (p: WsEvents["request_completed"]) =>
        setMine((m) => ({
          ...m,
          created: m.created.map((r) => (r.id === p.request_id ? { ...r, status: "completed" as const } : r)),
          helping: m.helping.map((r) => (r.id === p.request_id ? { ...r, status: "completed" as const } : r)),
        }))
      ),
      ws.on("request_expired", (p: WsEvents["request_expired"]) =>
        setMine((m) => ({
          ...m,
          created: m.created.map((r) => (r.id === p.request_id ? { ...r, status: "expired" as const } : r)),
        }))
      ),
    ];
    return () => {
      clearInterval(t);
      handlers.forEach((off) => off());
    };
  }, [load]);

  async function revealPin(id: string) {
    setShowPin(id);
    if (!pins[id]) {
      try {
        const res = await api<{ pin: string }>(`/requests/${id}/pin`);
        setPins((p) => ({ ...p, [id]: res.pin }));
      } catch {
        setPins((p) => ({ ...p, [id]: "error" }));
      }
    }
  }

  async function cancel(id: string) {
    try {
      await api(`/requests/${id}/cancel`, { method: "POST" });
      setMine((m) => ({ ...m, created: m.created.map((r) => (r.id === id ? { ...r, status: "cancelled" as const } : r)) }));
    } catch (err) {
      console.warn(err);
    }
  }

  const row = (r: Card, kind: "created" | "helping") => {
    return (
      <article key={r.id} className="slide-up rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 truncate text-[13px] font-bold">Help request</div>
          {statusChip(r.status)}
        </div>
        <p className="mt-2 text-[13px] text-slate-300">{r.description}</p>

        {/* live viewer counter — rule 2 */}
        {kind === "created" && r.status === "open" && (
          <div className="mt-3">
            <ViewerCounter requestId={r.id} />
          </div>
        )}

        {/* handshake PIN — rule 5 */}
        {kind === "created" && (r.status === "accepted" || r.status === "completed") && (
          <div className="mt-3 rounded-xl border border-violet/40 bg-violet/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-violet">Handshake PIN (share when you meet)</p>
              <button onClick={() => revealPin(r.id)} className="rounded-lg bg-violet/20 px-2.5 py-1 text-xs font-bold text-violet">
                {showPin === r.id ? "hide" : "show"}
              </button>
            </div>
            {showPin === r.id && (
              <p className="mt-2 text-center text-3xl font-black tracking-[0.5em] text-violet">
                {pins[r.id] ?? "…"}
              </p>
            )}
            {r.status === "accepted" && r.helper && (
              <p className="mt-1.5 text-[11px] text-muted">
                Helper: <span className="font-mono text-slate-300">@{r.helper.handle}</span>{" "}
                <GenderBadge gender={r.helper.gender} verified={r.helper.gender_verified} /> — chat is open below
              </p>
            )}
          </div>
        )}

        <div className="mt-3 flex gap-2">
          {(r.status === "accepted" || r.status === "completed") && (
            <Link
              href={`/chat/${r.id}`}
              className="flex-1 rounded-xl bg-neon px-3 py-2.5 text-center text-sm font-bold text-ink transition active:scale-95"
            >
              Open chat
            </Link>
          )}
          {kind === "created" && r.status === "open" && (
            <button
              onClick={() => cancel(r.id)}
              className="flex-1 rounded-xl border border-danger/40 px-3 py-2.5 text-center text-sm font-bold text-danger transition active:scale-95"
            >
              Cancel
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="px-4 pt-2">
      <header className="mb-3">
        <h1 className="text-lg font-black tracking-tight">Your tasks</h1>
        <p className="text-[11px] text-muted">Live status for everything you asked or accepted</p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-2xl bg-panel" />
          ))}
        </div>
      ) : (
        <div className="space-y-5 pb-4">
          <section>
            <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">
              Requests you posted ({mine.created.length})
            </h2>
            {mine.created.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                Nothing posted yet — drop a pin on the Radar.
              </p>
            ) : (
              <div className="space-y-3">{mine.created.map((r) => row(r, "created"))}</div>
            )}
          </section>

          <section>
            <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-muted">
              Requests you&apos;re helping ({mine.helping.length})
            </h2>
            {mine.helping.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                No accepted tasks — check the feed.
              </p>
            ) : (
              <div className="space-y-3">{mine.helping.map((r) => row(r, "helping"))}</div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
