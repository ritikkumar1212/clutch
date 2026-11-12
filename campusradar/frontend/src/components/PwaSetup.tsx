"use client";

/* Add-to-Home-Screen prompt + push notification opt-in. */
import { useEffect, useState } from "react";
import { enablePushNotifications, registerServiceWorker } from "@/lib/push";

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PwaSetup() {
  const [installEvt, setInstallEvt] = useState<BIPEvent | null>(null);
  const [pushState, setPushState] = useState<"idle" | "on" | "err">("idle");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    registerServiceWorker();
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if ("Notification" in window && Notification.permission === "granted") setPushState("on");
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function onEnablePush() {
    const res = await enablePushNotifications();
    if (res.ok) {
      setPushState("on");
      setMsg("");
    } else {
      setPushState("err");
      setMsg(res.detail);
    }
  }

  return (
    <div className="space-y-2">
      {installEvt && (
        <button
          onClick={() => installEvt.prompt()}
          className="w-full rounded-xl bg-violet/20 px-4 py-3 text-sm font-bold text-violet transition active:scale-95"
        >
          Install CampusRadar on this phone
        </button>
      )}
      <button
        onClick={onEnablePush}
        disabled={pushState === "on"}
        className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition active:scale-95 ${
          pushState === "on" ? "bg-mint/15 text-mint" : "bg-white/10 text-slate-100"
        }`}
      >
        {pushState === "on"
          ? "Push notifications are ON"
          : pushState === "err"
            ? "Retry enabling notifications"
            : "Enable help-request notifications"}
      </button>
      {msg && <p className="text-xs text-danger">{msg}</p>}
      <p className="text-[11px] leading-relaxed text-muted">
        You will only be pinged for requests matching your location and the
        requester&apos;s helper filter — nothing else.
      </p>
    </div>
  );
}
