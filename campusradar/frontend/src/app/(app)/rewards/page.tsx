"use client";

import { useEffect, useState } from "react";
import { api, getUser, updateUser } from "@/lib/api";
import { GenderBadge } from "@/components/Badges";
import { fmtClock } from "@/lib/geo";
import { ws } from "@/lib/ws";
import type { LedgerRow, LeaderboardRow, User, WsEvents } from "@/lib/types";

export default function RewardsPage() {
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [tab, setTab] = useState<"ledger" | "board">("board");
  const [points, setPoints] = useState(0);

  useEffect(() => {
    setPoints(getUser()?.help_points ?? 0);
    api<User>("/users/me").then((user) => { setPoints(user.help_points); updateUser(user); }).catch(() => {});
    api<LedgerRow[]>("/users/me/ledger").then(setLedger).catch(() => {});
    api<LeaderboardRow[]>("/users/leaderboard").then(setBoard).catch(() => {});
    return ws.on("points_awarded", (event: WsEvents["points_awarded"]) => {
      setPoints(event.total);
      api<LedgerRow[]>("/users/me/ledger").then(setLedger).catch(() => {});
    });
  }, []);

  const reasonLabel: Record<string, string> = { signup_bonus: "Welcome bonus", completion: "Helped a campusmate", adjustment: "Adjustment" };

  return (
    <main className="px-4 pb-6 pt-2">
      <header>
        <h1 className="section-title text-neon">Flex & Perks</h1>
        <p className="mt-1 text-sm text-muted">Every favor banks points. Big or small, all help is equal.</p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => setTab("board")} className={`surface pressable p-4 text-left ${tab === "board" ? "border-neon/40" : ""}`}>
          <span className="text-2xl text-neon">♜</span><p className="mt-3 text-sm font-black">Campus leaderboard</p><p className="mt-1 text-[11px] text-muted">See who is showing up.</p>
        </button>
        <button type="button" onClick={() => setTab("ledger")} className={`surface pressable p-4 text-left ${tab === "ledger" ? "border-neon/40" : ""}`}>
          <span className="text-2xl text-mint">▣</span><p className="mt-3 text-sm font-black">Point history</p><p className="mt-1 text-[11px] text-muted">Every credit, clearly logged.</p>
        </button>
      </div>

      <section className="mt-3 flex items-center gap-3 rounded-[19px] border border-line bg-panel p-4">
        <div className="grid h-12 w-12 place-items-center rounded-[15px] bg-neon/15 text-2xl text-neon">♧</div>
        <div><p className="text-sm font-black">Your Clutch balance</p><p className="mt-1 text-xs text-muted">Earn points through verified help.</p></div>
        <span className="ml-auto rounded-full bg-neon px-3 py-1.5 text-xs font-black text-ink">{points} pts</span>
      </section>

      {tab === "board" ? (
        <section className="mt-7">
          <div className="flex items-end justify-between"><div><h2 className="text-base font-black">Top helpers</h2><p className="mt-1 text-[11px] text-muted">Anonymous by design.</p></div><div className="rounded-full bg-panel p-1 text-[10px] font-bold text-muted"><span className="inline-block rounded-full bg-neon px-3 py-1 text-ink">All time</span></div></div>
          <div className="mt-3 space-y-2">
            {board.length === 0 && <p className="surface px-4 py-6 text-center text-sm text-muted">No helpers ranked yet.</p>}
            {board.map((row) => {
              const isMe = getUser()?.handle === row.handle;
              return <div key={row.handle} className={`flex items-center gap-3 rounded-[17px] border px-3 py-3 ${isMe ? "border-mint/50 bg-mint/10" : "border-line bg-panel"}`}>
                <span className={`grid h-8 w-8 place-items-center rounded-full ${row.rank <= 3 ? "bg-neon/15 text-neon" : "bg-panel2 text-muted"} text-xs font-black`}>{row.rank}</span>
                <span className="avatar-token grid h-8 w-8 place-items-center rounded-full bg-[#35332f] text-[10px] font-black">{row.handle.slice(0, 2).toUpperCase()}</span>
                <div className="min-w-0"><p className="truncate text-xs font-black">{row.handle}{isMe && <span className="ml-1 text-mint">· you</span>}</p><p className="mt-0.5 text-[10px] text-muted"><GenderBadge gender={row.gender} verified /> · campus helper</p></div>
                <span className="ml-auto text-sm font-black text-mint">{row.help_points}</span>
              </div>;
            })}
          </div>
        </section>
      ) : (
        <section className="mt-7"><h2 className="text-base font-black">Point history</h2><div className="mt-3 space-y-2">{ledger.length === 0 && <p className="surface px-4 py-6 text-center text-sm text-muted">Complete a verified help to earn your first points.</p>}{ledger.map((entry) => <div key={entry.id} className="flex items-center justify-between rounded-[17px] border border-line bg-panel px-4 py-3"><div><p className="text-sm font-bold">{reasonLabel[entry.reason] || entry.reason}</p><p className="mt-1 text-[11px] text-muted">{entry.note || "CampusRadar activity"} · {fmtClock(entry.created_at)}</p></div><span className="text-sm font-black text-mint">+{entry.points}</span></div>)}</div></section>
      )}
    </main>
  );
}
