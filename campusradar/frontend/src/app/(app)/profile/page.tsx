"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, getUser, updateUser } from "@/lib/api";
import { GenderBadge } from "@/components/Badges";
import ThemeToggle from "@/components/ThemeToggle";
import type { HistoryItem, RequestCard, User, WsEvents } from "@/lib/types";
import { ws } from "@/lib/ws";

interface Mine { created: RequestCard[]; helping: RequestCard[] }
type HistoryTab = "all" | "given" | "got";
const HISTORY_PAGE_SIZE = 20;

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [mine, setMine] = useState<Mine>({ created: [], helping: [] });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  const loadHistory = useCallback(async (offset: number, replace = false, search = "", fromDate = "", toDate = "") => {
    if (replace) setHistoryLoading(true);
    else setHistoryLoadingMore(true);
    setHistoryError("");
    try {
      const params = new URLSearchParams({ limit: String(HISTORY_PAGE_SIZE), offset: String(offset) });
      if (search) params.set("q", search);
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const page = await api<HistoryItem[]>(`/requests/history?${params.toString()}`);
      setHistory((current) => replace ? page : [...current, ...page]);
      setHistoryHasMore(page.length === HISTORY_PAGE_SIZE);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Could not load your karma log");
    } finally {
      if (replace) setHistoryLoading(false);
      else setHistoryLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setMe(getUser());
    api<User>("/users/me").then((user) => { setMe(user); updateUser(user); }).catch(() => {});
    api<Mine>("/requests/mine").then(setMine).catch(() => {});
    const offPoints = ws.on("points_awarded", (event: WsEvents["points_awarded"]) => {
      setMe((current) => current ? { ...current, help_points: event.total } : current);
    });
    return offPoints;
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory(0, true, historySearch.trim(), historyFromDate, historyToDate);
    }, historySearch.trim() || historyFromDate || historyToDate ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [historySearch, historyFromDate, historyToDate, loadHistory]);

  const activeCount = mine.created.filter((task) => ["open", "accepted"].includes(task.status)).length + mine.helping.filter((task) => task.status === "accepted").length;
  const visibleHistory = history.filter((item) => historyTab === "all" || (historyTab === "given" ? item.role === "helper" : item.role === "requester"));

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

      <Link href="/profile?view=history#karma-log" className="surface pressable mt-3 flex w-full items-center gap-3 p-4 text-left" aria-label="Open My Clutch Karma Log">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px] bg-emeraldtint-glow text-lg text-emeraldtint-muted">✓</span>
        <span className="min-w-0"><strong className="block text-sm text-neon">My Clutch Karma Log</strong><span className="mt-1 block text-[11px] text-muted">See every favor you gave, got, and completed.</span></span>
        <span className="ml-auto text-lg text-muted" aria-hidden="true">›</span>
      </Link>

      <section id="karma-log" className="surface mt-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-base font-black text-neon">My Clutch Karma Log</h2><p className="mt-1 text-[11px] text-muted">Every move, kept on record.</p></div>
          <span className="rounded-full bg-panel2 px-2.5 py-1 text-[10px] font-bold text-muted">{history.length}</span>
        </div>

        <label className="mt-4 block"><span className="sr-only">Search your karma log</span><input type="search" value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Search favors or aliases" className="w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-xs placeholder:text-muted focus:border-neon focus:outline-none" /></label>
        <div className="mt-2 grid grid-cols-2 gap-2"><label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">From</span><input type="date" value={historyFromDate} max={historyToDate || undefined} onChange={(event) => setHistoryFromDate(event.target.value)} className="w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-xs text-mist focus:border-neon focus:outline-none" /></label><label className="block"><span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">To</span><input type="date" value={historyToDate} min={historyFromDate || undefined} onChange={(event) => setHistoryToDate(event.target.value)} className="w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-xs text-mist focus:border-neon focus:outline-none" /></label></div>

        <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-panel2 p-1" role="tablist" aria-label="History filters">
          {([ ["all", "All Moves"], ["given", "Given Help"], ["got", "Got Help"] ] as const).map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={historyTab === value} onClick={() => setHistoryTab(value)} className={`rounded-lg px-2 py-2 text-[10px] font-bold transition ${historyTab === value ? "bg-neon text-ink" : "text-muted"}`}>{label}</button>
          ))}
        </div>

        {historyLoading && <div className="mt-4 space-y-2" aria-live="polite"><div className="h-20 animate-pulse rounded-xl bg-panel2" /><div className="h-20 animate-pulse rounded-xl bg-panel2" /></div>}
        {!historyLoading && historyError && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger"><p>{historyError}</p><button type="button" onClick={() => void loadHistory(0, true, historySearch.trim(), historyFromDate, historyToDate)} className="mt-2 font-bold underline">Try again</button></div>}
        {!historyLoading && !historyError && visibleHistory.length === 0 && <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-6 text-center"><p className="text-2xl">✦</p><p className="mt-2 text-sm font-bold">No moves yet?</p><p className="mt-1 text-xs leading-relaxed text-muted">Time to build some serious campus karma. Drop a ping or catch a clutch!</p></div>}
        {!historyLoading && !historyError && visibleHistory.length > 0 && <div className="mt-4 space-y-2">{visibleHistory.map((item) => <HistoryCard key={item.id} item={item} onOpen={() => setSelectedHistory(item)} />)}</div>}
        {!historyLoading && !historyError && historyHasMore && <button type="button" onClick={() => void loadHistory(history.length, false, historySearch.trim(), historyFromDate, historyToDate)} disabled={historyLoadingMore} className="mt-4 w-full rounded-xl border border-line py-2.5 text-xs font-bold text-muted disabled:opacity-50">{historyLoadingMore ? "Loading more…" : "Load more"}</button>}
      </section>

      <button onClick={logout} className="mb-6 mt-6 w-full rounded-[14px] border border-danger/40 py-3 text-sm font-bold text-danger transition active:scale-95">Log out</button>

      {selectedHistory && <HistoryDetails item={selectedHistory} onClose={() => setSelectedHistory(null)} />}
    </main>
  );
}

function Stat({ value, label, icon }: { value: string; label: string; icon: string }) { return <div className="rounded-[16px] border border-line bg-panel px-2 py-3 text-center"><span className="text-lg text-neon">{icon}</span><p className="mt-1 text-base font-black">{value}</p><p className="mt-0.5 text-[10px] text-muted">{label}</p></div>; }

function HistoryCard({ item, onOpen }: { item: HistoryItem; onOpen: () => void }) {
  const completed = item.status === "completed";
  const otherLabel = item.other_user?.handle || "campus crew";
  const when = item.completed_at || item.created_at;
  return <button type="button" onClick={onOpen} className="block w-full rounded-xl border border-line bg-panel px-3.5 py-3 text-left transition active:scale-[.99]">
    <div className="flex items-start gap-3">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${completed ? "bg-emeraldtint-glow text-emeraldtint-muted" : "bg-panel2 text-muted"}`} aria-hidden="true">{completed ? "✓" : "—"}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5"><span className={`text-[10px] font-black uppercase tracking-wide ${completed ? "text-emeraldtint-muted" : "text-muted"}`}>{item.status}</span><span className="rounded-full bg-panel2 px-2 py-0.5 text-[9px] font-bold text-muted">{item.role === "helper" ? "Helper Mode" : "Requester Mode"}</span></div>
        <p className="mt-1 text-xs font-bold">{item.role === "helper" ? "Helped" : "Caught a clutch from"}: <span className="text-neon">{otherLabel}</span></p>
        <p className="mt-1 truncate text-xs text-muted">{item.description}</p>
        <p className="mt-2 text-[10px] text-muted">{relativeTime(when)}</p>
      </div>
      <span className={`shrink-0 text-right text-[10px] font-black ${completed ? "text-emeraldtint-muted" : "text-muted line-through"}`}>{completed ? `+${item.points_awarded} points` : "0 points"}</span>
    </div>
  </button>;
}

function HistoryDetails({ item, onClose }: { item: HistoryItem; onClose: () => void }) {
  const completed = item.status === "completed";
  const exactTime = item.completed_at || item.created_at;
  return <div className="fixed inset-0 z-50 bg-black/60" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="absolute inset-x-0 bottom-0 mx-auto max-w-[430px] rounded-t-[24px] border border-line bg-panel px-5 pb-6 pt-3 shadow-2xl safe-bottom" role="dialog" aria-modal="true" aria-labelledby="history-detail-title">
      <div className="mx-auto h-1 w-10 rounded-full bg-line" />
      <div className="mt-4 flex items-start justify-between gap-3"><div><p className={`text-[10px] font-black uppercase tracking-wide ${completed ? "text-emeraldtint-muted" : "text-muted"}`}>{item.status}</p><h2 id="history-detail-title" className="mt-1 text-lg font-black text-neon">{item.role === "helper" ? "Given Help" : "Got Help"}</h2></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-panel2 text-muted" aria-label="Close details">×</button></div>
      <div className="mt-5 space-y-3 text-sm"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Campus alias</p><p className="mt-1 font-bold">{item.other_user?.handle || "campus crew"}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Favor description</p><p className="mt-1 leading-relaxed">{item.description}</p></div><div className="grid grid-cols-2 gap-3"><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Exact time</p><p className="mt-1 text-xs">{formatExactTime(exactTime)}</p></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Points</p><p className={`mt-1 text-xs font-black ${completed ? "text-emeraldtint-muted" : "text-muted line-through"}`}>{completed ? `+${item.points_awarded} points` : "0 points"}</p></div></div><div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Completion PIN</p><p className="mt-1 font-mono text-lg font-black tracking-[0.28em] text-neon">{item.completion_pin || "Not available"}</p></div></div>
      <button type="button" onClick={onClose} className="mt-6 w-full rounded-xl bg-neon py-3 text-sm font-black text-ink">Done</button>
    </section>
  </div>;
}

function formatExactTime(value: string | null): string {
  if (!value) return "Time unavailable";
  return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function relativeTime(value: string | null): string {
  if (!value) return "Time unavailable";
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function AvatarPicker({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; if (!file) return; setUploading(true); try { const body = new FormData(); body.append("file", file); onChange(await api<User>("/users/me/avatar", { method: "POST", body })); setShowOptions(false); } finally { setUploading(false); event.target.value = ""; } }
  async function useGeneratedAvatar() { setUploading(true); try { onChange(await api<User>("/users/me/avatar", { method: "DELETE" })); setShowOptions(false); } finally { setUploading(false); } }
  return <><button type="button" onClick={() => setShowOptions((open) => !open)} className="rounded-full" aria-label="Change profile photo" aria-expanded={showOptions}>{user.avatar_url ? <img src={user.avatar_url} alt="" className="h-24 w-24 rounded-full border-2 border-line object-cover" /> : <GeneratedAvatar handle={user.handle} />}</button>{showOptions && <div className="mt-3 rounded-xl border border-line bg-panel p-3"><div className="flex gap-2"><button type="button" onClick={useGeneratedAvatar} disabled={uploading} className="rounded-lg border border-line px-3 py-2 text-[11px] font-bold disabled:opacity-40">Generated avatar</button><button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="rounded-lg bg-neon px-3 py-2 text-[11px] font-bold text-ink disabled:opacity-40">Upload photo</button></div><label className="mt-2 block text-left"><span className="text-[10px] font-bold uppercase tracking-wider text-muted">Photo visibility</span><select value={user.avatar_visibility} onChange={async (event) => { const updated = await api<User>("/users/me/avatar-visibility", { method: "PATCH", body: JSON.stringify({ avatar_visibility: event.target.value }) }); onChange(updated); }} className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-xs"><option value="private">Only me</option><option value="accepted_only">Accepted task partners</option><option value="public">Everyone in Clutch</option></select></label></div>}<input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={chooseAvatar} /></>;
}

function GeneratedAvatar({ handle }: { handle: string }) { const hue = Array.from(handle).reduce((total, char) => total + char.charCodeAt(0), 0) % 360; return <div className="profile-generated-avatar grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-line shadow-lg" style={{ background: `hsl(${hue} 25% 24%)` }} aria-label="Generated profile avatar"><span className="text-2xl font-black text-neon">{handle.slice(0, 2).toUpperCase()}</span></div>; }
