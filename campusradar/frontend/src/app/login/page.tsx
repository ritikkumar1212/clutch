"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ token: string; user: { profile_complete: boolean } }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      setSession(data.token, data.user as never);
      router.replace(data.user.profile_complete ? "/radar" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 safe-top">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-neon/15">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-neon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><path d="M12 12l6-4" />
          </svg>
        </div>
        <h1 className="text-2xl font-black tracking-tight">Welcome back</h1>
        <p className="text-center text-sm text-muted">
          Sign in with your verified phone number (UIET Chandigarh)
        </p>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="phone" className="mb-1 block text-xs font-semibold text-muted">Phone number</label>
          <input
            id="phone" type="tel" inputMode="tel" required value={phone} autoComplete="tel"
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 98765 43210"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-semibold text-muted">Password</label>
          <input
            id="password" type="password" required value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
          />
        </div>
        {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
        <button
          type="submit" disabled={busy}
          className="w-full rounded-xl bg-neon py-3.5 text-sm font-black text-ink shadow-lg shadow-neon/20 transition active:scale-95 disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="font-bold text-neon">Create an account</Link>
      </p>
    </main>
  );
}
