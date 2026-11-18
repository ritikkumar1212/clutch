"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getUser } from "@/lib/api";
import { GenderBadge } from "@/components/Badges";
import type { User } from "@/lib/types";

export default function RadarPage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [description, setDescription] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [landmark, setLandmark] = useState<string | null>(null);
  const [femaleOnly, setFemaleOnly] = useState(false);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setMe(getUser());
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );
  }, []);

  async function post() {
    if (lat == null || lng == null) return setError("Allow location access so the helper knows where to come");
    if (description.trim().length < 5) return setError("Say a little more about what you need");
    setPosting(true);
    setError("");
    try {
      await api("/requests", {
        method: "POST",
        body: JSON.stringify({ description: description.trim(), landmark, lat, lng, gender_filter: femaleOnly ? "female_only" : "everyone" }),
      });
      router.push("/requests");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not drop the ping");
      setPosting(false);
    }
  }

  return (
    <main className="px-4 pb-6 pt-2">
      <header>
        <h1 className="section-title text-neon">Drop a Ping</h1>
        <p className="mt-1 max-w-[360px] text-sm leading-relaxed text-muted">No categories. No location filters. Just say what you need — campus handles the rest.</p>
      </header>

      {me && <div className="mt-5 flex items-center gap-2 text-xs text-muted"><span className="grid h-8 w-8 place-items-center rounded-full bg-panel2 font-black text-neon">{me.handle.slice(0, 2).toUpperCase()}</span><span>@{me.handle}</span><GenderBadge gender={me.gender} verified={me.gender_verified} /></div>}

      <section className="surface mt-5 overflow-hidden p-4">
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={6}
          maxLength={500}
          placeholder="Spill it. What do you need? e.g. 'Left my lab coat in the hostel, have a chem eval in 30 - anyone got a spare?'"
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-slate-100 placeholder:text-muted/80 focus:outline-none"
        />
        <div className="mt-3 border-t border-line pt-3 text-xs text-muted">Location is private until accepted</div>
      </section>

      {me?.gender === "female" && <section className="mt-5">
        <p className="text-xs font-bold text-slate-200">Who can help?</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setFemaleOnly(false)} className={`rounded-[14px] border py-3 text-sm font-black ${!femaleOnly ? "border-mint bg-mint/10 text-slate-100" : "border-line text-muted"}`}>Anyone</button>
          <button type="button" onClick={() => setFemaleOnly(true)} className={`rounded-[14px] border py-3 text-sm font-black ${femaleOnly ? "border-neon bg-neon/10 text-neon" : "border-line text-muted"}`}>Female helpers only</button>
        </div>
      </section>}

      {error && <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
      <button onClick={post} disabled={posting} className="pressable mt-6 w-full rounded-[15px] bg-neon py-3.5 text-sm font-black text-ink disabled:opacity-50">{posting ? "Dropping your ping..." : "Drop the ping"}</button>
      <p className="mt-3 text-center text-[11px] text-muted">You can cancel an open ping from My tasks.</p>
    </main>
  );
}
