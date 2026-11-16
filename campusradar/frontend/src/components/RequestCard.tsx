"use client";

import { useEffect, useState } from "react";
import { fmtClock, fmtDistance, fmtTimeLeft, haversineMeters } from "@/lib/geo";
import { GenderBadge } from "@/components/Badges";
import { useLivePosition } from "@/hooks/useGeolocation";
import type { RequestCard as Card } from "@/lib/types";

interface Props {
  req: Card;
  variant: "feed" | "mine" | "helping";
  busy?: boolean;
  onAccept?: (id: string) => void;
}

export default function RequestCard({ req, variant, busy, onAccept }: Props) {
  const me = useLivePosition();
  const dist = me && req.lat != null && req.lng != null
    ? haversineMeters(me.lat, me.lng, req.lat, req.lng)
    : null;
  const [left, setLeft] = useState(() => fmtTimeLeft(req.expires_at));

  useEffect(() => {
    const timer = setInterval(() => setLeft(fmtTimeLeft(req.expires_at)), 1000);
    return () => clearInterval(timer);
  }, [req.expires_at]);

  const handle = req.requester?.handle ?? "Campusmate";
  const initials = handle.slice(0, 2).toUpperCase();
  const time = req.created_at ? fmtClock(req.created_at) : "just now";
  const urgent = left.startsWith("0m") || left.endsWith("s left");

  return (
    <article className="slide-up surface p-4 shadow-[0_10px_30px_rgba(0,0,0,.12)]">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#373531] text-sm font-black text-[#f3e9df]">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="truncate text-sm font-black text-slate-100">{handle}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                <span className="text-mint">♨</span> Campus verified <span className="text-line">·</span> {time}
              </p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${urgent ? "bg-danger/15 text-danger" : "bg-mint/15 text-mint"}`}>
              {left}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-4 text-[14px] leading-relaxed text-[#ddd3cc]">{req.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-muted">
        {dist != null && <span className="rounded-full bg-white/[0.08] px-2.5 py-1">{fmtDistance(dist)} away</span>}
        {req.landmark && <span className="max-w-full truncate rounded-full bg-white/[0.08] px-2.5 py-1">{req.landmark}</span>}
        {req.gender_filter === "female_only" && <span className="rounded-full bg-neon/15 px-2.5 py-1 text-neon">Female helpers only</span>}
        {req.requester && <GenderBadge gender={req.requester.gender} verified={req.requester.gender_verified} />}
      </div>

      {variant === "feed" ? (
        <div className="mt-4 flex gap-2">
          <button onClick={() => onAccept?.(req.id)} disabled={busy} className="pressable flex-1 rounded-[14px] bg-neon py-3 text-sm font-black text-ink disabled:opacity-50">
            {busy ? "Clutching…" : "I Got You  →"}
          </button>
          <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] border border-line text-muted" aria-label="Report request">⚑</button>
        </div>
      ) : (
        <p className="mt-4 text-[11px] font-semibold text-muted">
          {req.status === "open" && left}
          {req.status === "accepted" && "helper on the way · open the chat"}
          {req.status === "completed" && "completed"}
          {req.status === "expired" && "expired"}
          {req.status === "cancelled" && "cancelled"}
        </p>
      )}
    </article>
  );
}
