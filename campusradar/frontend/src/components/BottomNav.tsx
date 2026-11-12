"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/radar", label: "Radar", icon: "radar" },
  { href: "/feed", label: "Feed", icon: "feed" },
  { href: "/requests", label: "Tasks", icon: "tasks" },
  { href: "/rewards", label: "Points", icon: "points" },
  { href: "/profile", label: "You", icon: "you" },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const cls = `h-5 w-5 ${active ? "text-neon" : "text-muted"}`;
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
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line bg-panel/95 backdrop-blur"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      aria-label="Main navigation"
    >
      <div className="grid grid-cols-5 pt-1.5">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold ${
                active ? "text-neon" : "text-muted"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={t.icon} active={active} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
