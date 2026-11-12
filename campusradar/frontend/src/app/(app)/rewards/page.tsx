"use client";

/* Help Points wallet (rule 6): balance, ledger history, campus leaderboard. */
import { useEffect, useState } from "react";
import { api, getUser, updateUser } from "@/lib/api";
import { GenderBadge, PointsPill } from "@/components/Badges";
import { fmtClock } from "@/lib/geo";
import { ws } from "@/lib/ws";
import type { LedgerRow, LeaderboardRow, User, WsEvents } from "@/lib/types";

export default function RewardsPage() {
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [tab, setTab] = useState<"ledger" | "board">("board");
  const [points, setPoints] = useState<number>(typeof window !== "undefined" ? getUser()?.help_points ?? 0 : 0);

  useEffect(() => {
    /* server is the source of truth for the balance (localStorage may be stale) */
    api<User>("/users/me")
      .then((u) => {
        setPoints(u.help_points);
        updateUser(u);
      })
      .catch(() => {});
    api<LedgerRow[]>("/users/me/ledger").then(setLedger).catch(() => {});
    api<LeaderboardRow[]>("/users/leaderboard").then(setBoard).catch(() => {});
    const off = ws.on("points_awarded", (p: WsEvents["points_awarded"]) => {
      setPoints(p.total);
      api<LedgerRow[]>("/users/me/ledger").then(setLedger).catch(() => {});
      api<User>("/users/me")
        .then((u) => updateUser(u))
        .catch(() => {});
    });
    return off;
  }, []);

  useEffect(() => {
    const u = getUser();
    if (u && u.help_points !== points) updateUser({ ...u, help_points: points });
  }, [points]);

  const reasonLabel: Record<string, string> = {
    signup_bonus: "Welcome bonus",
    completion: "Helped a campusmate",
    adjustment: "Adjustment",
  };

  return (
    <main className="px-4 pt-2">
      <header className="mb-3">
        <h1 className="text-lg font-black tracking-tight">Help Points</h1>
        <p className="text-[11px] text-muted">Earn +10 per verified help, +5 if urgent, +10 if emergency</p>
      </header>

      <div className="rounded-3xl border border-mint/30 bg-gradient-to-br from-mint/15 to-transparent p-6 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Your balance</p>
        <p className="mt-1 text-5xl font-black text-mint">{points}</p>
        <p className="mt-1 text-[11px] text-muted">Help Points — campus bragging rights, not money</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {(["board", "ledger"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl border py-2.5 text-xs font-bold transition ${
              tab === t ? "border-neon bg-neon/10 text-neon" : "border-line bg-panel text-muted"
            }`}
          >
            {t === "board" ? "Leaderboard" : "History"}
          </button>
        ))}
      </div>

      {tab === "board" ? (
        <div className="mt-3 space-y-2 pb-4">
          {board.length === 0 && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">No helpers ranked yet.</p>}
          {board.map((row) => {
            const isMe = getUser()?.handle === row.handle;
            return (
              <div
                key={row.handle}
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${
                  isMe ? "border-neon/50 bg-neon/10" : "border-line bg-panel"
                }`}
              >
                <span className={`w-6 text-center text-sm font-black ${row.rank <= 3 ? "text-amber" : "text-muted"}`}>
                  {row.rank}
                </span>
                <span className="font-mono text-sm font-bold">@{row.handle}</span>
                <GenderBadge gender={row.gender} verified />
                <span className="ml-auto"><PointsPill points={row.help_points} /></span>
              </div>
            );
          })}
          <p className="pt-1 text-center text-[10px] text-muted">
            Anonymous by design — handles only, no names or photos.
          </p>
        </div>
      ) : (
        <div className="mt-3 space-y-2 pb-4">
          {ledger.length === 0 && (
            <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
              Complete a verified help to earn your first points.
            </p>
          )}
          {ledger.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-2xl border border-line bg-panel px-4 py-3">
              <div>
                <p className="text-sm font-bold">{reasonLabel[l.reason] || l.reason}</p>
                {l.note && <p className="text-[11px] text-muted">{l.note}</p>}
                <p className="text-[10px] text-muted">{fmtClock(l.created_at)}</p>
              </div>
              <PointsPill points={l.points} />
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
