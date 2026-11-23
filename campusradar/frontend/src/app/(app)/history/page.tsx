"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, getUser, updateUser } from "@/lib/api";
import { ws } from "@/lib/ws";
import type { HistoryItem, User, WsEvents } from "@/lib/types";

const HISTORY_PAGE_SIZE = 20;
type HistoryTab = "all" | "given" | "got";

export default function HistoryPage() {
  const router = useRouter();
  const [me, setMe] = useState<User | null>(null);
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

  const loadHistory = useCallback(
    async (offset: number, replace = false, search = "", fromDate = "", toDate = "") => {
      if (replace) setHistoryLoading(true);
      else setHistoryLoadingMore(true);
      setHistoryError("");
      try {
        const params = new URLSearchParams({
          limit: String(HISTORY_PAGE_SIZE),
          offset: String(offset),
        });
        if (search) params.set("q", search);
        if (fromDate) params.set("from_date", fromDate);
        if (toDate) params.set("to_date", toDate);
        const page = await api<HistoryItem[]>(`/requests/history?${params.toString()}`);
        setHistory((current) => (replace ? page : [...current, ...page]));
        setHistoryHasMore(page.length === HISTORY_PAGE_SIZE);
      } catch (error) {
        setHistoryError(
          error instanceof Error ? error.message : "Could not load your karma log"
        );
      } finally {
        if (replace) setHistoryLoading(false);
        else setHistoryLoadingMore(false);
      }
    },
    []
  );
  useEffect(() => {
    setMe(getUser());
    api<User>("/users/me")
      .then((user) => {
        setMe(user);
        updateUser(user);
      })
      .catch(() => {});
    const offPoints = ws.on(
      "points_awarded",
      (event: WsEvents["points_awarded"]) => {
        setMe((current) =>
          current ? { ...current, help_points: event.total } : current
        );
      }
    );
    return offPoints;
  }, [loadHistory]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistory(0, true, historySearch.trim(), historyFromDate, historyToDate);
    }, historySearch.trim() || historyFromDate || historyToDate ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [historySearch, historyFromDate, historyToDate, loadHistory]);

  const visibleHistory = history.filter(
    (item) =>
      historyTab === "all" ||
      (historyTab === "given" ? item.role === "helper" : item.role === "requester")
  );

  const completed = (item: HistoryItem) => item.status === "completed";
  const when = (item: HistoryItem) => item.completed_at || item.created_at;
  const otherLabel = (item: HistoryItem) =>
    item.role === "helper"
      ? item.other_user?.handle || "campusmate"
      : item.other_user?.handle || "campusmate";

  function formatExactTime(value: string | null): string {
    if (!value) return "Time unavailable";
    return new Date(value).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
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
    return new Date(value).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  return (
    <main className="px-4 pb-6 pt-2 min-h-screen">
      <header className="mt-4 mb-6">
        <Link
          href="/profile"
          className="flex items-center gap-2 text-xs font-bold text-muted underline underline-offset-4 hover:text-neon"
        >
          <span>← Back</span>
        </Link>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-neon">
          My Clutch Karma Log
        </h1>
        <p className="mt-1 text-sm text-muted">
          See every favor you gave, got, and completed.
        </p>
      </header>

      {me && (
        <section className="mb-6 rounded-[19px] border border-line bg-panel p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-muted">
                Your Clutch balance
              </p>
              <p className="mt-1 text-2xl font-black text-neon">
                {me.help_points} pts
              </p>
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-full bg-neon/15 text-2xl text-neon">
              ♧
            </div>
          </div>
        </section>
      )}
      <section className="mb-6 rounded-xl border border-line bg-panel p-4 shadow-sm">
        <div className="flex items-end justify-between gap-3 mb-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">
              Filter moves
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg p-1" role="tablist" aria-label="History tabs">
            {[["all", "All Moves"], ["given", "Given Help"], ["got", "Got Help"]].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={historyTab === value}
                onClick={() => setHistoryTab(value)}
                className={`rounded-md px-3 py-2 text-[11px] font-bold transition ${
                  historyTab === value
                    ? "bg-neon text-ink shadow-sm"
                    : "text-muted hover:text-neon"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="sr-only">Search your karma log</span>
          <input
            type="search"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search favors or aliases"
            className="w-full rounded-xl border border-line bg-panel2 px-3 py-2.5 text-xs placeholder:text-muted focus:border-neon focus:outline-none"
          />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
              From
            </span>
            <input
              type="date"
              value={historyFromDate}
              max={historyToDate || undefined}
              onChange={(event) => setHistoryFromDate(event.target.value)}
              className="w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-xs text-mist focus:border-neon focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
              To
            </span>
            <input
              type="date"
              value={historyToDate}
              min={historyFromDate || undefined}
              onChange={(event) => setHistoryToDate(event.target.value)}
              className="w-full rounded-xl border border-line bg-panel2 px-3 py-2 text-xs text-mist focus:border-neon focus:outline-none"
            />
          </label>
        </div>
      </section>
      {historyLoading && (
        <div className="mt-4 space-y-3" aria-live="polite">
          <div className="h-24 animate-pulse rounded-xl bg-panel2" />
          <div className="h-24 animate-pulse rounded-xl bg-panel2" />
          <div className="h-24 animate-pulse rounded-xl bg-panel2" />
        </div>
      )}

      {!historyLoading && historyError && (
        <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <p>{historyError}</p>
          <button
            type="button"
            onClick={() =>
              void loadHistory(
                0,
                true,
                historySearch.trim(),
                historyFromDate,
                historyToDate
              )
            }
            className="mt-3 font-bold underline"
          >
            Try again
          </button>
        </div>
      )}

      {!historyLoading && !historyError && visibleHistory.length === 0 && (
        <div className="mt-8 rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-4xl">✦</p>
          <p className="mt-3 text-sm font-bold">No moves yet?</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Time to build some serious campus karma. Drop a ping or catch a clutch!
          </p>
        </div>
      )}

      {!historyLoading && !historyError && visibleHistory.length > 0 && (
        <div className="mt-4 space-y-2">
          {visibleHistory.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedHistory(item)}
              className="w-full flex items-center justify-between rounded-xl border border-line bg-panel px-4 py-3.5 hover:bg-panel2 transition pressable"
              aria-label={`View details for ${item.description}`}
            >
              <div className="flex items-center gap-3 shrink-0">
                <span
                  className={`h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${
                    completed(item)
                      ? "bg-emeraldtint-glow text-emeraldtint-muted"
                      : "bg-panel2 text-muted"
                  }`}
                  aria-hidden="true"
                >
                  {completed(item) ? "✓" : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wide ${
                        completed(item)
                          ? "text-emeraldtint-muted"
                          : "text-muted"
                      }`}
                    >
                      {item.status}
                    </span>
                    <span className="rounded-full bg-panel2 px-2 py-0.5 text-[9px] font-bold text-muted">
                      {item.role === "helper" ? "Helper Mode" : "Requester Mode"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold">
                    {item.role === "helper"
                      ? "Helped"
                      : "Caught a clutch from"}:
                    <span className="text-neon">{otherLabel(item)}</span>
                  </p>
                  <p className="mt-1 truncate text-xs text-muted">
                    {item.description}
                  </p>
                  <p className="mt-2 text-[10px] text-muted">
                    {relativeTime(when(item))}
                  </p>
                </div>
              </div>
              <span
                className={`shrink-0 text-right text-[10px] font-black ${
                  completed(item)
                    ? "text-emeraldtint-muted"
                    : "text-muted line-through"
                }`}
              >
                {completed(item) ? `+${item.points_awarded} points` : "0 points"}
              </span>
            </button>
          ))}
        </div>
      )}

      {!historyLoading && !historyError && historyHasMore && (
        <button
          type="button"
          onClick={() =>
            void loadHistory(
              history.length,
              false,
              historySearch.trim(),
              historyFromDate,
              historyToDate,
            )
          }
          disabled={historyLoadingMore}
          className="mt-6 w-full rounded-xl border border-line py-3 text-xs font-bold text-muted disabled:opacity-50 pressable"
        >
          {historyLoadingMore ? "Loading more…" : "Load more"}
        </button>
      )}
      {selectedHistory && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelectedHistory(null);
          }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <section className="relative z-10 w-full max-w-md mx-4 rounded-t-[28px] border border-line bg-panel shadow-2xl safe-bottom">
            <div className="mx-auto h-1 w-12 rounded-full bg-line mb-4" />
            <div className="px-5 pb-6 pt-3">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p
                    className={`text-[10px] font-black uppercase tracking-wide ${
                      completed(selectedHistory)
                        ? "text-emeraldtint-muted"
                        : "text-muted"
                    }`}
                  >
                    {selectedHistory.status}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-neon">
                    {selectedHistory.role === "helper"
                      ? "Given Help"
                      : "Got Help"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedHistory(null)}
                  className="grid h-10 w-10 place-items-center rounded-full bg-panel2 text-muted"
                  aria-label="Close details"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Campus alias
                  </p>
                  <p className="mt-1 font-bold">
                    {selectedHistory.other_user?.handle || "campus crew"}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                    Favor description
                  </p>
                  <p className="mt-1 leading-relaxed">
                    {selectedHistory.description}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Exact time
                    </p>
                    <p className="mt-1 text-xs">
                      {formatExactTime(
                        selectedHistory.completed_at ||
                          selectedHistory.created_at
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Points
                    </p>
                    <p className={`mt-1 text-xs font-black ${
                      completed(selectedHistory)
                        ? "text-emeraldtint-muted"
                        : "text-muted line-through"
                    }`}
                    >
                      {completed(selectedHistory)
                        ? `+${selectedHistory.points_awarded} points`
                        : "0 points"}
                    </p>
                  </div>
                </div>
                {selectedHistory.completion_pin && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                      Completion PIN
                    </p>
                    <p className="mt-1 font-mono text-lg font-black tracking-[0.28em] text-neon">
                      {selectedHistory.completion_pin}
                    </p>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSelectedHistory(null)}
                className="mt-8 w-full rounded-xl bg-neon py-3.5 text-sm font-black text-ink pressable"
              >
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
