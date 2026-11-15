"use client";

import { useEffect, useState } from "react";

const THEME_KEY = "cr_theme";

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const nextLight = saved === "light";
    document.documentElement.classList.toggle("light", nextLight);
    setLight(nextLight);
  }, []);

  function toggle() {
    const nextLight = !light;
    document.documentElement.classList.toggle("light", nextLight);
    localStorage.setItem(THEME_KEY, nextLight ? "light" : "dark");
    setLight(nextLight);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center justify-between rounded-xl border border-line bg-panel2 px-3 py-2.5 text-sm font-semibold transition active:scale-[0.99]"
      aria-pressed={light}
    >
      <span>{light ? "Light theme" : "Dark theme"}</span>
      <span className="text-lg" aria-hidden="true">{light ? "☀" : "☾"}</span>
    </button>
  );
}
