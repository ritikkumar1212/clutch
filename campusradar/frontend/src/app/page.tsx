"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const token = getToken();
    const user = getUser();
    if (!token) router.replace("/login");
    else if (!user?.profile_complete) router.replace("/onboarding");
    else router.replace("/radar");
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center bg-ink">
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-20 w-20 place-items-center rounded-3xl bg-neon/15">
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-neon" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" />
            <path d="M12 12l6-4" /><circle cx="12" cy="12" r="1.2" fill="currentColor" />
          </svg>
        </div>
        <h1 className="text-xl font-black tracking-tight">CampusRadar</h1>
        <p className="text-xs text-muted">{mounted ? "Loading the campus network…" : ""}</p>
      </div>
    </main>
  );
}
