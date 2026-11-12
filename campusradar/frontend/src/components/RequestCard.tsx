"use client";

/* Request card: feed variant (helper sees anonymous card + accept) and
   mine variant (requester sees live viewers + PIN; helper sees chat link). */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fmtDistance, fmtTimeLeft, haversineMeters } from "@/lib/geo";
import { GenderBadge } from "@/components/Badges";
import { useLivePosition } from "@/hooks/useGeolocation";
import type { RequestCard as Card } from "@/lib/types";

interface Props {
  req: Card;
  variant: "feed" | "mine" | "helping";
  busy?: boolean;
  onAccept?: (id: string) => void;
  removedIds?: Set<string>;
}

export default function RequestCard({ req, variant, busy, onAccept }: Props) {
  const me = useLivePosition();
  const dist = me ? haversineMeters(me.lat, me.lng, req.lat, req.lng) : null;
  const [left, setLeft] = useState(() => fmtTimeLeft(req.expires_at));

  useEffect(() => {
    const t = setInterval(() => setLeft(fmtTimeLeft(req.expires_at)), 1000);
    return () => clearInterval(t);
  }, [req.expires_at]);

  const expiredSoon = left.startsWith("0m") || left.endsWith("s left");

  return (
    <article className="slide-up rounded-2xl border border-line bg-panel p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-bold">Help request</span>
            {req.gender_filter === "female_only" && (
              <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-bold text-pink-300">
                female helpers only
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-slate-300">{req.description}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-slate-200">@{req.requester?.handle ?? "—"}</span>
          {req.requester && <GenderBadge gender={req.requester.gender} verified={req.requester.gender_verified} />}
        </span>
        {req.landmark && <span className="truncate">{req.landmark}</span>}
        {dist != null && <span>≈ {fmtDistance(dist)} from you</span>}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        {variant === "feed" ? (
          <>
            <span className={`text-[11px] ${expiredSoon ? "text-danger" : "text-muted"}`}>{left}</span>
            <button
              onClick={() => onAccept?.(req.id)}
              disabled={busy}
              className="rounded-xl bg-neon px-4 py-2 text-sm font-bold text-ink shadow-lg shadow-neon/20 transition active:scale-95 disabled:opacity-50"
            >
              {busy ? "Accepting…" : "Accept & help"}
            </button>
          </>
        ) : (
          <span className="text-[11px] text-muted">
            {req.status === "open" && left}
            {req.status === "accepted" && "helper on the way — open the chat"}
            {req.status === "completed" && "completed"}
            {req.status === "expired" && "expired"}
            {req.status === "cancelled" && "cancelled"}
          </span>
        )}
      </div>
    </article>
  );
}
