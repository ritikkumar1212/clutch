"use client";

/* Anonymous gender badge (rule 3): the ONLY identity attribute visible pre-acceptance. */
export function GenderBadge({ gender, verified }: { gender: string; verified: boolean }) {
  const isF = gender === "female";
  const isM = gender === "male";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        isF
          ? "bg-pink-500/15 text-pink-300"
          : isM
            ? "bg-sky-500/15 text-sky-300"
            : "bg-white/10 text-slate-300"
      }`}
      title={verified ? "Verified gender badge" : "Unverified"}
    >
      {isF ? "F" : isM ? "M" : "O"}
      {verified && (
        <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

export function PointsPill({ points }: { points: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-mint/15 px-2 py-0.5 text-xs font-bold text-mint">
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 3L6 13h5l-1 8 8-11h-5l0-7z" />
      </svg>
      {points} pts
    </span>
  );
}
