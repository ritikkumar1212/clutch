/* Task categories with inline SVG icons (no external icon deps). */
import React from "react";

export interface Category {
  id: string;
  label: string;
  hint: string;
  color: string;   // tailwind classes for the chip
  icon: React.ReactNode;
}

const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const CATEGORIES: Category[] = [
  {
    id: "ride",
    label: "Ride / Lift",
    hint: "Need a lift somewhere",
    color: "text-neon",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M4 13l1.5-4.5A2 2 0 017.4 7h9.2a2 2 0 011.9 1.5L20 13" />
        <path d="M3 13h18v4a1 1 0 01-1 1h-2l-1-2H7l-1 2H4a1 1 0 01-1-1v-4z" />
        <circle cx="7.5" cy="17.5" r="0.4" /><circle cx="16.5" cy="17.5" r="0.4" />
      </svg>
    ),
  },
  {
    id: "medicine",
    label: "Medicine run",
    hint: "Pharmacy pickup / meds",
    color: "text-danger",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <rect x="9" y="3" width="6" height="18" rx="3" transform="rotate(45 12 12)" />
        <path d="M9.2 9.2l5.6 5.6" />
      </svg>
    ),
  },
  {
    id: "printout",
    label: "Printout",
    hint: "Print & carry pages",
    color: "text-violet",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M7 8V4h10v4" />
        <rect x="4" y="8" width="16" height="8" rx="2" />
        <rect x="7" y="13" width="10" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "charger",
    label: "Charger",
    hint: "Cable / power bank",
    color: "text-amber",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M13 3L6 13h5l-1 8 8-11h-5l0-7z" />
      </svg>
    ),
  },
  {
    id: "study",
    label: "Study help",
    hint: "Doubts / notes / prep",
    color: "text-mint",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <path d="M4 19V6a2 2 0 012-2h5a3 3 0 013 3v13" />
        <path d="M14 7a3 3 0 013-3h3v14h-4a3 3 0 00-3 3" />
        <path d="M4 19a2 2 0 002 2h8" />
      </svg>
    ),
  },
  {
    id: "errand",
    label: "Errand",
    hint: "Pick up / drop something",
    color: "text-sky-300",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" {...s}>
        <rect x="3" y="8" width="18" height="12" rx="2" />
        <path d="M9 8V6a3 3 0 016 0v2" />
        <path d="M3 12h18" />
      </svg>
    ),
  },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[5];
}

export const URGENCY_META: Record<string, { label: string; chip: string; bonus: number }> = {
  normal: { label: "Normal", chip: "bg-white/10 text-slate-300", bonus: 0 },
  urgent: { label: "Urgent", chip: "bg-amber-400/15 text-amber-300", bonus: 5 },
  emergency: { label: "Emergency", chip: "bg-red-500/15 text-red-300", bonus: 10 },
};

export const QUICK_REPLIES = [
  "On my way",
  "Reached the gate",
  "5 mins away",
  "Wait there, coming",
  "Can't find you — call?",
];
