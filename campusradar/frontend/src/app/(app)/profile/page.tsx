"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, getUser, updateUser } from "@/lib/api";
import { GenderBadge } from "@/components/Badges";
import ThemeToggle from "@/components/ThemeToggle";
import type { RequestCard, User, WsEvents } from "@/lib/types";
import { ws } from "@/lib/ws";

interface Mine { created: RequestCard[]; helping: RequestCard[] }

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [mine, setMine] = useState<Mine>({ created: [], helping: [] });

  useEffect(() => {
    setMe(getUser());
    api<User>("/users/me").then((user) => { setMe(user); updateUser(user); }).catch(() => {});
    api<Mine>("/requests/mine").then(setMine).catch(() => {});
    const offPoints = ws.on("points_awarded", (event: WsEvents["points_awarded"]) => {
      setMe((current) => current ? { ...current, help_points: event.total } : current);
    });
    return offPoints;
  }, []);

  const activeCount = mine.created.filter((task) => ["open", "accepted"].includes(task.status)).length + mine.helping.filter((task) => task.status === "accepted").length;

  function logout() { clearSession(); router.replace("/login"); }

  return (
    <main className="px-4 pb-6 pt-2">
      <header className="flex items-center justify-between"><h1 className="section-title text-neon">My Vibe</h1><ThemeToggle /></header>
      {me && <section className="surface mt-5 flex flex-col items-center px-4 py-5 text-center"><AvatarPicker user={me} onChange={(updated) => { setMe(updated); updateUser(updated); }} /><p className="mt-3 text-lg font-black">{me.handle}</p><span className="mt-2 verified-pill"><span>♧</span> Verified Campus Student</span><p className="mt-3 text-xs text-muted">◉ Identity verified privately · never shown publicly</p><button type="button" className="mt-2 text-xs text-muted" onClick={() => navigator.clipboard?.writeText(me.handle)}>▣ tap to copy alias</button></section>}

      <section className="mt-3 grid grid-cols-3 gap-2">
        <Stat value={String(me?.help_points ?? 0)} label="Clutch points" icon="ϟ" />
        <Stat value={me?.profile_complete ? "100%" : "—"} label="Profile ready" icon="♨" />
        <Stat value={String(activeCount)} label="Active pings" icon="▣" />
      </section>

      <Link href="/requests" className="surface pressable mt-3 flex w-full items-center gap-3 p-4 text-left"><span className="grid h-10 w-10 place-items-center rounded-[13px] bg-panel2 text-xl text-neon">ϟ</span><span><strong className="block text-sm">{activeCount ? "You have an active clutch" : "No active clutch"}</strong><span className="mt-1 block text-[11px] text-muted">{activeCount ? "Open My Tasks to coordinate." : "Pick one ping from the feed when you are ready."}</span></span><span className="ml-auto text-muted">›</span></Link>

      <section className="surface mt-3 p-4"><p className="text-sm font-black text-neon">♧ Clutch Guard</p><p className="mt-1 text-xs leading-relaxed text-muted">Your alias stays anonymous. Chats lock after completion and live coordinates are only shared with an accepted task partner.</p></section>

      <button onClick={logout} className="mb-6 mt-6 w-full rounded-[14px] border border-danger/40 py-3 text-sm font-bold text-danger transition active:scale-95">Log out</button>
    </main>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon: string }) { return <div className="rounded-[16px] border border-line bg-panel px-2 py-3 text-center"><span className="text-lg text-neon">{icon}</span><p className="mt-1 text-base font-black">{value}</p><p className="mt-0.5 text-[10px] text-muted">{label}</p></div>; }

function AvatarPicker({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setUploading(true); try { const body = new FormData(); body.append("file", file); onChange(await api<User>("/users/me/avatar", { method: "POST", body })); setShowOptions(false); } finally { setUploading(false); event.target.value = ""; } }
  async function useGeneratedAvatar() { setUploading(true); try { onChange(await api<User>("/users/me/avatar", { method: "DELETE" })); setShowOptions(false); } finally { setUploading(false); } }
  return <><button type="button" onClick={() => setShowOptions((open) => !open)} className="rounded-full" aria-label="Change profile photo" aria-expanded={showOptions}>{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-24 w-24 rounded-full border-2 border-line object-cover" /> : <GeneratedAvatar handle={user.handle} />}</button>{showOptions && <div className="mt-3 rounded-xl border border-line bg-panel p-3"><div className="flex gap-2"><button type="button" onClick={useGeneratedAvatar} disabled={uploading} className="rounded-lg border border-line px-3 py-2 text-[11px] font-bold disabled:opacity-40">Generated avatar</button><button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-lg bg-neon px-3 py-2 text-[11px] font-bold text-ink disabled:opacity-40">Upload photo</button></div><label className="mt-2 block text-left"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Photo visibility</span><select value={user.avatar_visibility} onChange={async (event) => { const updated = await api<User>("/users/me/avatar-visibility", { method: "PATCH", body: JSON.stringify({ avatar_visibility: event.target.value }) }); onChange(updated); }} className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-xs"><option value="private">Only me</option><option value="accepted_only">Accepted task partners</option><option value="public">Everyone in Clutch</option></select></label></div>}<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={chooseAvatar} /></>;
}

function GeneratedAvatar({ handle }: { handle: string }) { const hue = Array.from(handle).reduce((total, char) => total + char.charCodeAt(0), 0) % 360; return <div className="profile-generated-avatar grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-line shadow-lg" style={{ background: `hsl(${hue} 25% 24%)` }} aria-label="Generated profile avatar"><span className="text-2xl font-black text-neon">{handle.slice(0, 2).toUpperCase()}</span></div>; }
