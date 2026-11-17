"use client";

/* Anonymous gender badge (rule 3): the ONLY identity attribute visible pre-acceptance. */
export function GenderBadge({ gender, verified }: { gender: string; verified: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-mint/20 bg-mint/10 px-2 py-0.5 text-[10px] font-bold tracking-wide text-mint"
      title={verified ? "Verified gender badge" : "Unverified"}
    >
      {gender === "female" ? "Female" : gender === "male" ? "Male" : "Campus"}
      {verified && (
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

export function PointsPill({ points }: { points: number }) {
  return <span className="inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-xs font-black text-neon">{points} pts</span>;
}

export function FireIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#ff704d"
        d="M13.2 1.5c.2 4.2 1.2 6.5 3.2 8.4 1.9 1.8 2.8 3.6 2.8 5.7 0 3.8-2.9 6.7-7.2 7.4-4.3-.7-7.2-3.6-7.2-7.4 0-3.1 1.8-5.8 4.8-8.7-.1 2.2.4 3.7 1.5 4.8 1-2.8 1.6-5.8 2.1-10.2Z"
      />
      <path
        fill="#ffc238"
        d="M9.1 11.5c.2 2 1 3.2 2.2 4.2.8.8 1.2 1.7 1.2 2.7 0 1.4-.4 2.5-1.1 3.5-2.4-.8-3.7-2.4-3.7-4.4 0-1.8.5-3.5 1.4-6Z"
      />
    </svg>
  );
}
