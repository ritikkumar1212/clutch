"use client";

/* Sends GPS to the server every ~25s (Redis-side lease 90s) — coordinates
   NEVER come back out to any client (privacy rule 1). */
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { ws } from "@/lib/ws";

export function useHeartbeat(active: boolean) {
  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    const send = async () => {
      if (document.visibilityState === "hidden") return;
      const pos = posRef.current;
      if (!pos) return;
      try {
        await api("/location/heartbeat", {
          method: "POST",
          body: JSON.stringify(pos),
        });
        ws.heartbeat(pos.lat, pos.lng);
        ws.ping(); // refresh ws presence flag
      } catch {
        /* silent — retried next tick */
      }
    };

    if ("geolocation" in navigator) {
      watchId.current = navigator.geolocation.watchPosition(
        (p) => {
          posRef.current = { lat: p.coords.latitude, lng: p.coords.longitude };
        },
        () => {
          /* permission denied: user can still browse, matching just won't include them */
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }

    send();
    const t = setInterval(send, 25000);
    const onVis = () => {
      if (document.visibilityState === "visible") send();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    };
  }, [active]);
}
