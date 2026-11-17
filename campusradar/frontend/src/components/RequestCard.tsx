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
    <article className="card slide-up p-4 transition hover:border-ambertint-soft/30 active:scale-[0.99]">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-700 font-display text-sm font-bold text-mist">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="truncate font-display text-sm font-bold text-mist">{handle}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-mist-faint">
                <span className="text-emeraldtint-muted">♨</span> Campus verified <span className="text-ink-600">·</span> {time}
              </p>
            </div>
            <span className={`chip shrink-0 ${urgent ? "bg-ambertint-glow text-ambertint-soft" : "bg-emeraldtint-glow text-emeraldtint-muted"}`}>
              {left}
            </span>
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-mist-dim">{req.description}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold text-muted">
        {dist != null && <span className="chip bg-ink-700 text-mist-dim">{fmtDistance(dist)} away</span>}
        {req.landmark && <span className="chip max-w-full truncate bg-ink-700 text-mist-dim">{req.landmark}</span>}
        {req.gender_filter === "female_only" && <span className="chip bg-ambertint-glow text-ambertint-soft">Female helpers only</span>}
        {req.requester && <GenderBadge gender={req.requester.gender} verified={req.requester.gender_verified} />}
      </div>

      {variant === "feed" ? (
        <div className="mt-4 flex gap-2">
          <button onClick={() => onAccept?.(req.id)} disabled={busy} className="btn-primary flex-1">
            {busy ? "Clutching…" : "ϟ  I Got You"}
          </button>
          <button type="button" className="btn-ghost px-3" aria-label="Report request">⚑</button>
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
