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
      className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-panel2 text-lg transition active:scale-90"
      aria-pressed={light}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
    >
      <TreeIcon light={light} />
    </button>
  );
}

function TreeIcon({ light }: { light: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill={light ? "#f3b64b" : "#316bd1"} />
      {light ? (
        <circle cx="16.5" cy="6.5" r="2.2" fill="#fff1b8" />
      ) : (
        <>
          <circle cx="6.5" cy="6.5" r="0.7" fill="#dbeafe" />
          <circle cx="16.5" cy="5.5" r="0.5" fill="#dbeafe" />
        </>
      )}
      <path
        fill={light ? "#263238" : "#0b1c42"}
        d="M12 8.2c-1.6 0-2.7 1-3 2.2-1.1-.1-2 .6-2 1.6 0 .7.4 1.3 1 1.6-.7.2-1.2.8-1.2 1.5 0 1 .8 1.7 1.8 1.7h2.5v3h1.8v-3h2.5c1 0 1.8-.7 1.8-1.7 0-.7-.5-1.3-1.2-1.5.6-.3 1-.9 1-1.6 0-1-.9-1.7-2-1.6-.3-1.2-1.4-2.2-3-2.2Z"
      />
    </svg>
  );
}
