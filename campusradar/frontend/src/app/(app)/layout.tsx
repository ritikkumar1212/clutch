"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { getToken, getUser } from "@/lib/api";
import { ws } from "@/lib/ws";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import BottomNav from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const isChat = pathname.startsWith("/chat/");
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
    <div className={`app-shell mx-auto min-h-screen max-w-[430px] safe-top ${isChat ? "pb-0" : "pb-28"}`}>
      {children}
      {!isChat && <BottomNav />}
    </div>
  );
}
