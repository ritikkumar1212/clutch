"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken, getUser } from "@/lib/api";
import { ws } from "@/lib/ws";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const authed = typeof window !== "undefined" ? !!getToken() : false;

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    if (!getUser()?.profile_complete) {
      router.replace("/onboarding");
      return;
    }
    ws.start(); // one persistent socket for viewer counts, broadcasts, chat
  }, [router]);

  useHeartbeat(authed); // server-side presence lease (rule 1: coordinates stay in Redis)

  return (
    <div className="mx-auto min-h-screen max-w-md pb-24 safe-top">
      {children}
      <BottomNav />
    </div>
  );
}
