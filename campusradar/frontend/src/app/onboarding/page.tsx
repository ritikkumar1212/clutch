"use client";

/* Onboarding: gender badge setup + optional UPI VPA + notifications.
   Gender surfaces ONLY as an anonymous verified badge (rules 3 & 5). */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, getUser, updateUser } from "@/lib/api";
import { registerServiceWorker } from "@/lib/push";
import type { User } from "@/lib/types";

export default function OnboardingPage() {
  const router = useRouter();
  const [gender, setGender] = useState<"male" | "female" | "other" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [vpa, setVpa] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  async function finish() {
    if (!gender) return setError("Pick how your badge should read");
    if (!confirm) return setError("Please confirm before continuing");
    setBusy(true);
    setError("");
    try {
      await registerServiceWorker();
      const user = await api<User>("/users/onboarding", {
        method: "POST",
        body: JSON.stringify({ gender, upi_vpa: vpa || undefined }),
      });
      updateUser(user);
      router.replace("/radar");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy(false);
    }
  }

  const options: Array<{ id: "female" | "male" | "other"; label: string; badge: string }> = [
    { id: "female", label: "Female", badge: "F" },
    { id: "male", label: "Male", badge: "M" },
    { id: "other", label: "Other", badge: "O" },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 safe-top">
      <h1 className="text-2xl font-black tracking-tight">Set up your badge</h1>
      <p className="mt-1 text-sm text-muted">
        CampusRadar is fully anonymous — your name and photo are never shown.
        Your gender becomes a{" "}
        <span className="font-semibold text-slate-200">verified badge</span> next to your
        handle, and lets female students restrict urgent requests to female helpers.
      </p>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => setGender(o.id)}
            className={`rounded-2xl border-2 p-4 text-center transition active:scale-95 ${
              gender === o.id ? "border-neon bg-neon/10" : "border-line bg-panel"
            }`}
          >
            <span className={`mx-auto mb-1.5 grid h-9 w-9 place-items-center rounded-full text-sm font-black ${
              o.id === "female" ? "bg-pink-500/15 text-pink-300"
                : o.id === "male" ? "bg-sky-500/15 text-sky-300"
                  : "bg-white/10 text-slate-300"
            }`}>
              {o.badge}
            </span>
            <span className="text-xs font-bold">{o.label}</span>
          </button>
        ))}
      </div>

      <label className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-panel p-3">
        <input
          type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-cyan-400"
        />
        <span className="text-xs leading-relaxed text-slate-300">
          I confirm this information is accurate and understand misuse of
          gender badges breaks campus trust rules.
        </span>
      </label>

      <div className="mt-4">
        <label htmlFor="vpa" className="mb-1 block text-xs font-semibold text-muted">
          UPI ID (optional — to receive tips)
        </label>
        <input
          id="vpa" value={vpa} onChange={(e) => setVpa(e.target.value)}
          placeholder="yourname@upi"
          className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
        />
      </div>

      {error && <p className="mt-3 rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}

      <button
        onClick={finish} disabled={busy}
        className="mt-6 w-full rounded-xl bg-neon py-3.5 text-sm font-black text-ink shadow-lg shadow-neon/20 transition active:scale-95 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Enter CampusRadar"}
      </button>
      {getUser()?.help_points ? (
        <p className="mt-3 text-center text-xs text-mint">
          {getUser()!.help_points} Help Points already on your account
        </p>
      ) : null}
    </main>
  );
}
