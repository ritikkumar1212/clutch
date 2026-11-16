"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ws } from "@/lib/ws";
import type { WsEvents } from "@/lib/types";

const TABS = [
  { href: "/feed", label: "Clutch Feed", icon: "feed" },
  { href: "/radar", label: "Drop a Ping", icon: "radar" },
  { href: "/rewards", label: "Flex & Perks", icon: "points" },
  { href: "/profile", label: "My Vibe", icon: "you" },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const cls = `h-6 w-6 ${active ? "text-ink" : "text-muted"}`;
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "radar":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...s}>
          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" />
          <path d="M12 12l6-4" /><circle cx="12" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case "feed":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...s}>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M7 9h10M7 13h7" />
        </svg>
      );
    case "tasks":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...s}>
          <path d="M9 6h11M9 12h11M9 18h11" />
          <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
        </svg>
      );
    case "points":
      return (
        <svg viewBox="0 0 24 24" className={cls} {...s}>
          <path d="M13 3L6 13h5l-1 8 8-11h-5l0-7z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={cls} {...s}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
  }
}

export default function BottomNav() {
  const pathname = usePathname();
  const [unreadFeed, setUnreadFeed] = useState(0);

  useEffect(() => {
    const stored = Number(localStorage.getItem("cr_feed_unread") || 0);
    setUnreadFeed(Number.isFinite(stored) ? stored : 0);
    if (pathname === "/feed") {
      localStorage.setItem("cr_feed_unread", "0");
      setUnreadFeed(0);
    }
    const offNew = ws.on("new_request", (_event: WsEvents["new_request"]) => {
      if (window.location.pathname === "/feed") return;
      setUnreadFeed((current) => {
        const next = current + 1;
        localStorage.setItem("cr_feed_unread", String(next));
        return next;
      });
    });
    return offNew;
  }, [pathname]);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] border-t border-white/5 bg-[#11110f]/95 backdrop-blur-xl"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-4 px-2 pt-2">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => {
                if (t.href === "/feed") {
                  localStorage.setItem("cr_feed_unread", "0");
                  setUnreadFeed(0);
                }
              }}
              className={`pressable flex flex-col items-center gap-1 py-1 text-[9px] font-bold ${
                active ? "text-mint" : "text-muted"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <span className={`relative grid h-11 w-11 place-items-center rounded-[16px] ${active ? "bg-neon" : "bg-white/[0.035]"}`}>
                <Icon name={t.icon} active={active} />
                {t.href === "/feed" && unreadFeed > 0 && (
                  <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-neon px-1 text-[9px] font-black text-ink">
                    {unreadFeed > 9 ? "9+" : unreadFeed}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap">{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
