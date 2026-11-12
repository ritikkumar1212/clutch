"use client";

/* Campus-wide help request: describe the need and broadcast it to active
   university users. The map pin identifies the place where help is needed. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import MapPicker from "@/components/MapPicker";
import { api, getUser } from "@/lib/api";
import { GenderBadge } from "@/components/Badges";
import type { User } from "@/lib/types";

export default function RadarPage() {
  const router = useRouter();
  const me = typeof window !== "undefined" ? getUser() : null;

  const [description, setDescription] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [landmark, setLandmark] = useState<string | null>(null);
  const [femaleOnly, setFemaleOnly] = useState(false);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  async function post() {
    if (lat == null || lng == null) return setError("Drop the target pin on the map first");
    if (description.trim().length < 5) return setError("Describe what you need (a few words)");
    setPosting(true);
    setError("");
    try {
      await api("/requests", {
        method: "POST",
        body: JSON.stringify({
          description: description.trim(),
          landmark,
          lat,
          lng,
          gender_filter: femaleOnly ? "female_only" : "everyone",
        }),
      });
      router.push("/requests"); // live viewer counter lives there
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post request");
      setPosting(false);
    }
  }

  return (
    <main className="px-4 pt-2">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-black tracking-tight">Campus Radar</h1>
          <p className="text-[11px] text-muted">Where do you need help?</p>
        </div>
        {me && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="font-mono text-slate-300">@{me.handle}</span>
            <GenderBadge gender={me.gender} verified={me.gender_verified} />
          </span>
        )}
      </header>

      <MapPicker
        lat={lat} lng={lng}
        onPinChange={(la, ln, lm) => {
          setLat(la); setLng(ln);
          if (lm !== undefined) setLandmark(lm);
        }}
      />

      <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-neon/30 bg-neon/5 px-3 py-2.5">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-neon" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
        <p className="text-sm font-semibold text-neon">
          {lat == null ? "Drop a pin where help is needed" : "Your request will reach active university users"}
        </p>
      </div>

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Describe exactly what you need, e.g. 'Paracetamol strip from the shop near Student Centre'"
        className="mt-4 w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
      />

      {/* helper eligibility filter */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={() => setFemaleOnly(!femaleOnly)}
          className={`flex items-center justify-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition active:scale-95 ${
            femaleOnly ? "border-pink-400 bg-pink-500/15 text-pink-300" : "border-line bg-panel text-muted"
          }`}
          aria-pressed={femaleOnly}
        >
          {femaleOnly ? "Female helpers only" : "Everyone"}
        </button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <button
        onClick={post} disabled={posting}
        className="mt-4 w-full rounded-2xl bg-neon py-4 text-base font-black text-ink shadow-xl shadow-neon/25 transition active:scale-95 disabled:opacity-50"
      >
        {posting ? "Broadcasting…" : "Broadcast request"}
      </button>
      <p className="mt-2 pb-4 text-center text-[11px] text-muted">
        Unaccepted requests auto-expire after 20 minutes. Helpers only see your handle, badge and this pin.
      </p>
    </main>
  );
}
