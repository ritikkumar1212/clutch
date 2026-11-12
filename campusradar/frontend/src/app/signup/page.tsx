"use client";

/* 3-step signup: campus email → OTP code → password. Anonymous handle is
   auto-generated; users never use real names on CampusRadar. */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ dev_code: string | null }>("/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setDevCode(res.dev_code);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ signup_token: string }>("/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ email, code }),
      });
      localStorage.setItem("cr_signup_token", res.signup_token);
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  }

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const signupToken = localStorage.getItem("cr_signup_token") || "";
      const data = await api<{ token: string; user: never }>("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ signup_token: signupToken, password }),
      });
      localStorage.removeItem("cr_signup_token");
      setSession(data.token, data.user);
      router.replace("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 safe-top">
      <div className="mb-8">
        <div className="mb-2 flex gap-1.5" aria-hidden>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${step >= n ? "bg-neon" : "bg-line"}`} />
          ))}
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          {step === 1 && "Verify it's really you"}
          {step === 2 && "Enter the 6-digit code"}
          {step === 3 && "Set a password"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {step === 1 && "Only verified campus emails can join the network."}
          {step === 2 && devCode
            ? `Dev mode: code shown here (production sends email) — ${devCode}`
            : "We sent a code to your inbox."}
          {step === 3 && "Last step — then pick your anonymous handle."}
        </p>
      </div>

      {step === 1 && (
        <form onSubmit={requestOtp} className="space-y-4">
          <input
            type="email" required value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@uiet.ac.in"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3.5 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
          />
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-neon py-3.5 text-sm font-black text-ink shadow-lg shadow-neon/20 transition active:scale-95 disabled:opacity-50">
            {busy ? "Sending…" : "Send verification code"}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={verifyOtp} className="space-y-4">
          <input
            inputMode="numeric" required value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3.5 text-center text-2xl font-black tracking-[0.4em] placeholder:tracking-normal placeholder:text-muted/60 focus:border-neon focus:outline-none"
          />
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-neon py-3.5 text-sm font-black text-ink shadow-lg shadow-neon/20 transition active:scale-95 disabled:opacity-50">
            {busy ? "Checking…" : "Verify code"}
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={finish} className="space-y-4">
          <input
            type="password" required minLength={8} value={password} autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 characters)"
            className="w-full rounded-xl border border-line bg-panel px-4 py-3.5 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none"
          />
          {error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-xl bg-neon py-3.5 text-sm font-black text-ink shadow-lg shadow-neon/20 transition active:scale-95 disabled:opacity-50">
            {busy ? "Creating account…" : "Create account"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Already helping?{" "}
        <Link href="/login" className="font-bold text-neon">Log in</Link>
      </p>
    </main>
  );
}
