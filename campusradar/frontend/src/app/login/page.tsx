"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, setSession } from "@/lib/api";
import ClutchMark from "@/components/ClutchMotionLogo";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const data = await api<{ token: string; user: { profile_complete: boolean } }>("/auth/login", { method: "POST", body: JSON.stringify({ phone, password }) }); setSession(data.token, data.user as never); router.replace(data.user.profile_complete ? "/radar" : "/onboarding"); }
    catch (err) { setError(err instanceof Error ? err.message : "Login failed"); } finally { setBusy(false); }
  }
  return <main className="mx-auto flex min-h-screen max-w-[430px] flex-col px-6 pb-8 pt-8 safe-top"><div className="flex items-center gap-2"><ClutchMark size={44} className="h-7 w-11 text-neon" background="var(--color-ink-950)" title="Clutch" /><span className="text-lg font-black text-neon">Clutch</span></div><div className="my-auto py-12"><span className="verified-pill">♧ Campus verified</span><h1 className="mt-6 text-[31px] font-black leading-tight tracking-[-0.06em]">Welcome back<br />to your backup.</h1><p className="mt-3 text-sm leading-relaxed text-muted">Sign in to help your campus crew and keep your alias private.</p><form onSubmit={submit} className="mt-8 space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold text-[#d5c8be]">Phone number</span><input type="tel" inputMode="tel" required value={phone} autoComplete="tel" onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" className="w-full rounded-[14px] border border-line bg-panel px-4 py-3.5 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none" /></label><label className="block"><span className="mb-2 block text-xs font-bold text-[#d5c8be]">Password</span><input type="password" required value={password} autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" className="w-full rounded-[14px] border border-line bg-panel px-4 py-3.5 text-sm placeholder:text-muted/60 focus:border-neon focus:outline-none" /></label>{error && <p className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>}<button type="submit" disabled={busy} className="pressable w-full rounded-[14px] bg-neon py-3.5 text-sm font-black text-ink disabled:opacity-50">{busy ? "Signing in…" : "Sign me in  →"}</button></form><p className="mt-6 text-center text-sm text-muted">New here? <Link href="/signup" className="font-black text-neon">Create an account</Link></p></div><p className="text-center text-[11px] text-muted">♧ Verified campus student · your identity stays sealed</p></main>;
}
