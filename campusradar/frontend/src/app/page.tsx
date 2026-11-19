"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/api";
import ClutchAppIcon from "@/components/ClutchAppIcon";

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
        <ClutchAppIcon size={80} className="h-20 w-20" title="Clutch" />
        <h1 className="text-xl font-black tracking-tight">CampusRadar</h1>
        <p className="text-xs text-muted">{mounted ? "Loading the campus network…" : ""}</p>
      </div>
    </main>
  );
}
