"use client";

/* Live viewer counter (rule 2): "X users are currently viewing your request". */
import { useEffect, useState } from "react";
import { ws } from "@/lib/ws";
import type { WsEvents } from "@/lib/types";

export default function ViewerCounter({ requestId }: { requestId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    ws.watchRequest(requestId);
    const off = ws.on("viewer_count", (p: WsEvents["viewer_count"]) => {
      if (p.request_id === requestId) setCount(p.count);
    });
    const offLock = ws.on("request_locked", () => setCount(null));
    return () => {
      off();
      offLock();
      ws.unwatchRequest(requestId);
    };
  }, [requestId]);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-neon/30 bg-neon/10 px-3 py-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="pulse-dot absolute inline-flex h-2.5 w-2.5 rounded-full bg-neon" />
      </span>
      <p className="text-sm font-semibold text-neon">
        {count === null
          ? "Connecting to live view counter…"
          : count === 0
            ? "Waiting for nearby helpers to open your request…"
            : `${count} user${count === 1 ? " is" : "s are"} currently viewing your request`}
      </p>
    </div>
  );
}
