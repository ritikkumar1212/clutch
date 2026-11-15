"use client";

/* Profile: anonymity explainer, UPI setup, PWA install + notifications. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, clearSession, getUser, updateUser } from "@/lib/api";
import { GenderBadge, PointsPill } from "@/components/Badges";
import PwaSetup from "@/components/PwaSetup";
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
  const [vpa, setVpa] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<Mine>({ created: [], helping: [] });
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const u = getUser();
    setMe(u);
    setVpa(u?.upi_vpa || "");
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

  const active = [
    ...mine.created.filter((task) => task.status === "open" || task.status === "accepted").map((task) => ({ task, role: "asked" })),
    ...mine.helping.filter((task) => task.status === "accepted").map((task) => ({ task, role: "helping" })),
  ];
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
            <span className="text-xs text-muted">{me.phone}</span>
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

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted">Your help activity</h2>
          <span className="text-[11px] text-muted">{active.length} active</span>
        </div>
        {active.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
            Accept a request from Feed to start helping.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map(({ task, role }) => (
              <TaskRow key={task.id} task={task} role={role} />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowHistory((open) => !open)}
          className="mt-3 flex w-full items-center justify-between rounded-xl border border-line bg-panel px-3 py-3 text-left"
        >
          <span className="text-xs font-bold">Help & points history ({history.length})</span>
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
      </section>

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted">Help Points</h2>
          {me && <PointsPill points={me.help_points} />}
        </div>
        <div className="rounded-2xl border border-mint/30 bg-gradient-to-br from-mint/15 to-transparent p-4">
          <p className="text-3xl font-black text-mint">{me?.help_points ?? 0}</p>
          <p className="text-[11px] text-muted">Earn points when a verified help is completed.</p>
        </div>
        <div className="mt-2 space-y-2">
          {board.slice(0, 3).map((row) => (
            <div key={row.handle} className="flex items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2">
              <span className="w-5 text-center text-xs font-black text-amber">{row.rank}</span>
              <span className="font-mono text-xs font-bold">@{row.handle}</span>
              <span className="ml-auto"><PointsPill points={row.help_points} /></span>
            </div>
          ))}
        </div>
      </section>

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
        <ThemeToggle />
        <div className="mt-3">
          <PwaSetup />
        </div>
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
