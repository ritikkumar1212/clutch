"use client";

/* Profile: anonymity explainer, UPI setup, PWA install + notifications. */
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, getUser, updateUser } from "@/lib/api";
import { FireIcon, GenderBadge, PointsPill } from "@/components/Badges";
import ThemeToggle from "@/components/ThemeToggle";
import { fmtClock } from "@/lib/geo";
import type { LedgerRow, LeaderboardRow, RequestCard, User, WsEvents } from "@/lib/types";
import { ws } from "@/lib/ws";

interface Mine {
  created: RequestCard[];
  helping: RequestCard[];
}

type HistoryEntry =
  | { kind: "task"; task: RequestCard; role: string }
  | { kind: "points"; ledger: LedgerRow };

export default function ProfilePage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
  const [mine, setMine] = useState<Mine>({ created: [], helping: [] });
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  useEffect(() => {
    const u = getUser();
    setMe(u);
    api<User>("/users/me").then((fresh) => {
      setMe(fresh);
      updateUser(fresh);
    }).catch(() => {});
    api<Mine>("/requests/mine").then(setMine).catch(() => {});
    api<LedgerRow[]>("/users/me/ledger").then(setLedger).catch(() => {});
    api<LeaderboardRow[]>("/users/leaderboard").then(setBoard).catch(() => {});
    const offPoints = ws.on("points_awarded", (event: WsEvents["points_awarded"]) => {
      setMe((current) => current ? { ...current, help_points: event.total } : current);
      api<LedgerRow[]>("/users/me/ledger").then(setLedger).catch(() => {});
    });
    return offPoints;
  }, []);

  const taskHistory = [
    ...mine.created.filter((task) => ["completed", "cancelled", "expired"].includes(task.status)).map((task) => ({ task, role: "asked" })),
    ...mine.helping.filter((task) => ["completed", "cancelled", "expired"].includes(task.status)).map((task) => ({ task, role: "helping" })),
  ];
  const history: HistoryEntry[] = [
    ...taskHistory.map(({ task, role }) => ({ kind: "task" as const, task, role })),
    ...ledger.map((entry) => ({ kind: "points" as const, ledger: entry })),
  ].sort((a, b) => {
    const aDate = a.kind === "task" ? a.task.created_at : a.ledger.created_at;
    const bDate = b.kind === "task" ? b.task.created_at : b.ledger.created_at;
    return new Date(bDate || 0).getTime() - new Date(aDate || 0).getTime();
  });

  function logout() {
    clearSession();
    router.replace("/login");
  }

  return (
    <main className="px-4 pt-2">
      {me && (
        <div className="relative flex flex-col items-center border-b border-line pb-5">
          <div className="absolute right-0 top-0">
            <ThemeToggle />
          </div>
          <AvatarPicker user={me} onChange={(updated) => { setMe(updated); updateUser(updated); }} />
          <p className="mt-2 font-mono text-lg font-black">@{me.handle}</p>
          <div className="mt-1 flex justify-center">
            <GenderBadge gender={me.gender} verified={me.gender_verified} />
          </div>
        </div>
      )}

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted">Your HelpScore</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowLeaderboard((open) => !open)}
          className="w-full rounded-2xl border border-mint/30 bg-gradient-to-br from-mint/15 to-transparent p-4 text-left transition active:scale-[.99]"
        >
          <div className="flex items-center gap-2">
            <FireIcon className="h-5 w-5 text-mint" />
            <p className="text-3xl font-black text-mint">{me?.help_points ?? 0} score</p>
          </div>
          <p className="text-[11px] text-muted">HelpScore — tap to view top scorers.</p>
        </button>
        {showLeaderboard && (
          <div className="mt-3">
            <div className="mb-2 flex items-end justify-between px-1">
              <div>
                <p className="text-sm font-black text-slate-100">Top scorers</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">Campus leaderboard</p>
              </div>
            </div>
            <div className="space-y-2">
            {board.slice(0, 3).map((row) => (
              <div key={row.handle} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-amber/15 text-xs font-black text-amber">{row.rank}</span>
                <span className="font-mono text-xs font-bold">@{row.handle}</span>
                <span className="ml-auto"><PointsPill points={row.help_points} /></span>
              </div>
            ))}
            </div>
          </div>
        )}
      </section>

      <h2 className="mb-2 mt-5 text-xs font-black uppercase tracking-wider text-muted">Privacy model</h2>
      <ul className="space-y-1.5 rounded-2xl border border-line bg-panel p-4 text-[11px] leading-relaxed text-muted">
        <li>• No individual user pins on any map, ever.</li>
        <li>• Pre-acceptance, helpers see only handle + badge + task + target pin.</li>
        <li>• Female-only requests are filtered out server-side — never delivered.</li>
        <li>• Chats auto-lock 30 minutes after completion; messages purge later.</li>
        <li>• Unaccepted requests expire after 20 minutes.</li>
      </ul>
      <button
        type="button"
        onClick={() => setShowHistory((open) => !open)}
        className="mt-5 flex w-full items-center justify-between rounded-xl border border-line bg-panel px-3 py-3 text-left"
      >
        <span className="text-xs font-bold">History</span>
        <span className="text-xs text-muted">{showHistory ? "hide" : "show"}</span>
      </button>
      {showHistory && (
        <div className="mt-2 space-y-2">
          {history.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
              Completed help will appear here.
            </p>
          ) : history.map((entry) => (
            entry.kind === "task"
              ? <TaskRow key={`task-${entry.task.id}`} task={entry.task} role={entry.role} />
              : <PointsRow key={`points-${entry.ledger.id}`} ledger={entry.ledger} />
          ))}
        </div>
      )}

      <button
        onClick={logout}
        className="mb-6 mt-6 w-full rounded-xl border border-danger/40 py-3.5 text-sm font-bold text-danger transition active:scale-95"
      >
        Log out
      </button>
    </main>
  );
}

function TaskRow({ task, role }: { task: RequestCard; role: string }) {
  const canOpenChat = task.status === "accepted" || task.status === "completed";
  return (
    <div className="rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold">{role === "helping" ? "You helped someone" : "You asked for help"}</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-muted">{task.status}</span>
      </div>
      <p className="mt-1.5 truncate text-sm text-slate-300">{task.description}</p>
      {canOpenChat && (
        <Link href={`/chat/${task.id}`} className="mt-2 block rounded-lg bg-neon px-3 py-2 text-center text-xs font-bold text-ink">
          {task.status === "completed" ? "View chat" : "Open chat"}
        </Link>
      )}
    </div>
  );
}

function PointsRow({ ledger }: { ledger: LedgerRow }) {
  const reasonLabel: Record<string, string> = {
    signup_bonus: "Welcome bonus",
    completion: "Helped a campusmate",
    adjustment: "Adjustment",
  };
  return (
    <div className="flex items-center justify-between rounded-2xl border border-line bg-panel px-3 py-3">
      <div>
        <p className="text-xs font-bold">{reasonLabel[ledger.reason] || ledger.reason}</p>
        {ledger.note && <p className="text-[11px] text-muted">{ledger.note}</p>}
        <p className="text-[10px] text-muted">{fmtClock(ledger.created_at)}</p>
      </div>
      <PointsPill points={ledger.points} />
    </div>
  );
}

function AvatarPicker({ user, onChange }: { user: User; onChange: (user: User) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  async function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      onChange(await api<User>("/users/me/avatar", { method: "POST", body }));
      setShowOptions(false);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function useGeneratedAvatar() {
    setUploading(true);
    try {
      onChange(await api<User>("/users/me/avatar", { method: "DELETE" }));
      setShowOptions(false);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowOptions((open) => !open)}
        className="rounded-full"
        aria-label="Change profile photo"
        aria-expanded={showOptions}
      >
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="h-24 w-24 rounded-full border-2 border-line object-cover shadow-lg" />
        ) : (
          <GeneratedAvatar handle={user.handle} />
        )}
      </button>
      {showOptions && (
        <div className="mt-2 rounded-xl border border-line bg-panel p-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={useGeneratedAvatar}
              disabled={uploading}
              className="rounded-lg border border-line px-3 py-2 text-[11px] font-bold text-slate-100 disabled:opacity-40"
            >
              Generated avatar
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-neon px-3 py-2 text-[11px] font-bold text-ink disabled:opacity-40"
            >
              Upload from gallery
            </button>
          </div>
          <label className="mt-2 block text-left">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Photo visibility</span>
            <select
              value={user.avatar_visibility}
              onChange={async (event) => {
                const updated = await api<User>("/users/me/avatar-visibility", {
                  method: "PATCH",
                  body: JSON.stringify({ avatar_visibility: event.target.value }),
                });
                onChange(updated);
              }}
              className="mt-1 w-full rounded-lg border border-line bg-ink px-3 py-2 text-xs text-slate-100"
            >
              <option value="private">Only me</option>
              <option value="accepted_only">Accepted task partners</option>
              <option value="public">Everyone in Clutch</option>
            </select>
          </label>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={chooseAvatar} />
    </>
  );
}

function GeneratedAvatar({ handle }: { handle: string }) {
  const hue = Array.from(handle).reduce((total, char) => total + char.charCodeAt(0), 0) % 360;
  return (
    <div
      className="grid h-24 w-24 place-items-center overflow-hidden rounded-full border-2 border-line shadow-lg"
      style={{ background: `hsl(${hue} 45% 28%)` }}
      aria-label="Generated profile avatar"
    >
      <svg viewBox="0 0 96 96" className="h-full w-full" aria-hidden="true">
        <circle cx="48" cy="40" r="20" fill="#f3c7a6" />
        <path d="M27 37c2-20 14-29 28-25 10 2 17 10 16 24-7-7-15-10-24-8-7 2-12 5-20 9Z" fill="#20252f" />
        <circle cx="40" cy="41" r="2" fill="#20252f" />
        <circle cx="56" cy="41" r="2" fill="#20252f" />
        <path d="M41 51c4 3 8 3 12 0" fill="none" stroke="#9d5f55" strokeWidth="2" strokeLinecap="round" />
        <path d="M25 92c2-20 12-29 23-29s21 9 23 29" fill="#ad8cff" />
        <path d="M34 66c8 7 20 7 28 0" fill="none" stroke="#f3c7a6" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </div>
  );
}
