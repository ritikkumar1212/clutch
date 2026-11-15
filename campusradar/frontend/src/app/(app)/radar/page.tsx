"use client";

/* Campus-wide help request: describe the need and broadcast it to active
   university users. The device location is captured automatically. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getUser } from "@/lib/api";
import { ws } from "@/lib/ws";
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
  const [liveStudents, setLiveStudents] = useState<number | null>(null);

  useEffect(() => {
    setMe(getUser());
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 30000, timeout: 20000 },
    );
  }, []);

  useEffect(() => {
    const off = ws.on("pong", (payload) => setLiveStudents(payload.online_users));
    ws.ping();
    const timer = setInterval(() => ws.ping(), 10000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, []);

  async function post() {
    if (lat == null || lng == null) {
      return setError("Allow location access so the helper knows where to come and help you");
    }
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
          <h1 className="text-lg font-black tracking-tight">Clutch</h1>
        </div>
        {me && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="font-mono text-slate-300">@{me.handle}</span>
            <GenderBadge gender={me.gender} verified={me.gender_verified} />
          </span>
        )}
      </header>

      <div
        className="mt-4 mx-auto flex h-20 w-20 flex-col items-center justify-center rounded-full border border-neon/40 bg-neon/10 text-center shadow-lg shadow-neon/10"
        aria-label={`${liveStudents ?? 0} clutchers live`}
      >
        <span className="text-xl font-black text-neon">{liveStudents ?? "—"}</span>
        <span className="whitespace-nowrap text-[8px] font-bold uppercase tracking-normal text-muted">clutchers live</span>
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="relative mr-3 min-w-0 flex-1">
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              e.currentTarget.style.height = "auto";
              e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 160)}px`;
            }}
            rows={1}
            maxLength={500}
            placeholder="Wants to clutch at the last moment"
            className="scrollbar-transparent min-h-12 max-h-40 w-full resize-none overflow-y-auto rounded-xl border border-line bg-panel px-4 py-3 pb-12 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
          />

          {me?.gender !== "male" && (
            <button
              key={femaleOnly ? "female-filter" : "everyone-filter"}
              onClick={() => setFemaleOnly(!femaleOnly)}
              className={`gender-toggle-flip absolute bottom-2 right-2 flex h-8 w-10 items-center justify-center rounded-lg border transition active:scale-95 ${
                femaleOnly ? "border-pink-400 bg-pink-500/15 text-pink-300" : "border-line bg-panel text-muted"
              }`}
              aria-pressed={femaleOnly}
              aria-label={femaleOnly ? "Female helpers only" : "Everyone"}
              title={femaleOnly ? "Female helpers only" : "Everyone"}
            >
              {femaleOnly ? (
                <svg key="female" aria-hidden="true" className="icon-flip h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M5.5 20c.7-3.1 2.9-5 6.5-5s5.8 1.9 6.5 5M12 14v7m-3-3h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              ) : (
                <svg key="everyone" aria-hidden="true" className="icon-flip h-5 w-5" viewBox="0 0 24 24" fill="none">
                  <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
                  <circle cx="17" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M3.5 19c.6-2.8 2.4-4.5 5.5-4.5s4.9 1.7 5.5 4.5m-1-3.5c.8-.9 1.8-1.4 3.5-1.4 2.1 0 3.5 1.2 4 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <button
        onClick={post} disabled={posting}
        className="floating-clutch fixed z-30 grid h-16 w-16 place-items-center rounded-full border border-neon/80 bg-neon/10 text-sm font-black text-neon shadow-none transition hover:scale-105 active:scale-90 disabled:opacity-50"
        aria-label={posting ? "Clutching request" : "Clutch"}
      >
        {posting ? "…" : "Clutch"}
      </button>
      <p className="mt-2 pb-4 text-center text-[11px] text-muted">
        Location stays private until a helper accepts. Both live locations appear in the accepted chat.
      </p>
    </main>
  );
}
