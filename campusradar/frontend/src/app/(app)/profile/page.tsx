"use client";

/* Profile: anonymity explainer, UPI setup, PWA install + notifications. */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, clearSession, getUser, updateUser } from "@/lib/api";
import { GenderBadge, PointsPill } from "@/components/Badges";
import PwaSetup from "@/components/PwaSetup";
import type { User } from "@/lib/types";

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [vpa, setVpa] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = getUser();
    setMe(u);
    setVpa(u?.upi_vpa || "");
    api<User>("/users/me").then((fresh) => {
      setMe(fresh);
      updateUser(fresh);
    }).catch(() => {});
  }, []);

  async function saveVpa() {
    setSaving(true);
    try {
      const fresh = await api<User>("/users/onboarding", {
        method: "POST",
        body: JSON.stringify({ gender: me?.gender || "other", upi_vpa: vpa || undefined }),
      });
      updateUser(fresh);
      setMe(fresh);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <main className="px-4 pt-2">
      <header className="mb-3">
        <h1 className="text-lg font-black tracking-tight">You (anonymously)</h1>
      </header>

      {me && (
        <div className="rounded-2xl border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-lg font-black">@{me.handle}</span>
            <GenderBadge gender={me.gender} verified={me.gender_verified} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-muted">{me.email}</span>
            <PointsPill points={me.help_points} />
          </div>
          <p className="mt-3 rounded-xl bg-white/5 px-3 py-2 text-[11px] leading-relaxed text-muted">
            Your real name and photo are never collected or shown. Other students
            only ever see this handle and your verified gender badge. Your GPS
            position lives server-side for a few seconds at a time and is never
            rendered for anyone else.
          </p>
        </div>
      )}

      <h2 className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted">Receive tips via UPI</h2>
      <div className="rounded-2xl border border-line bg-panel p-4">
        <input
          value={vpa} onChange={(e) => setVpa(e.target.value)}
          placeholder="yourname@upi"
          className="w-full rounded-xl border border-line bg-panel2 px-4 py-3 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
        />
        <button
          onClick={saveVpa} disabled={saving}
          className="mt-2 w-full rounded-xl bg-white/10 py-3 text-sm font-bold transition active:scale-95 disabled:opacity-50"
        >
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save UPI ID"}
        </button>
      </div>

      <h2 className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted">App</h2>
      <div className="rounded-2xl border border-line bg-panel p-4">
        <PwaSetup />
      </div>

      <h2 className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted">Privacy model</h2>
      <ul className="space-y-1.5 rounded-2xl border border-line bg-panel p-4 text-[11px] leading-relaxed text-muted">
        <li>• No individual user pins on any map, ever.</li>
        <li>• Pre-acceptance, helpers see only handle + badge + task + target pin.</li>
        <li>• Female-only requests are filtered out server-side — never delivered.</li>
        <li>• Chats auto-lock 30 minutes after completion; messages purge later.</li>
        <li>• Unaccepted requests expire after 20 minutes.</li>
      </ul>

      <button
        onClick={logout}
        className="mb-6 mt-6 w-full rounded-xl border border-danger/40 py-3.5 text-sm font-bold text-danger transition active:scale-95"
      >
        Log out
      </button>
    </main>
  );
}
