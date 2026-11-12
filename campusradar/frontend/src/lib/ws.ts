/* Singleton WebSocket client with reconnect + room replay. */
import { WS_BASE } from "./api";
import { getToken } from "./api";
import type { WsEvents, WsEventType } from "./types";

type Handler = (payload: unknown) => void;

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private rooms = new Set<string>(); // (type, id) pairs to replay on reconnect
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private connect(): void {
    const token = getToken();
    if (!token) {
      // retry once a session exists
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      return;
    }
    try {
      this.ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.attempts = 0;
      // replay room subscriptions so live counters/chat survive reconnects
      for (const key of this.rooms) {
        const [type, id] = key.split("|");
        this.sendRaw({ type, request_id: id });
      }
    };
    this.ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        const set = this.handlers.get(data.type as string);
        if (set) for (const h of set) h(data);
        const anySet = this.handlers.get("*");
        if (anySet) for (const h of anySet) h(data);
      } catch {
        /* ignore malformed frames */
      }
    };
    this.ws.onclose = () => {
      this.scheduleReconnect();
    };
    this.ws.onerror = () => {
      try {
        this.ws?.close();
      } catch {
        /* noop */
      }
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.attempts, 10000);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private sendRaw(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  on<K extends WsEventType>(type: K | "*", handler: (payload: WsEvents[K]) => void): () => void {
    const key = type as string;
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler as Handler);
    return () => {
      this.handlers.get(key)?.delete(handler as Handler);
    };
  }

  emit(obj: Record<string, unknown>): void {
    this.sendRaw(obj);
  }

  /* room subscriptions (replayed automatically after reconnect) */
  watchRequest(requestId: string): void {
    this.rooms.add(`view_request|${requestId}`);
    this.emit({ type: "view_request", request_id: requestId });
  }

  unwatchRequest(requestId: string): void {
    this.rooms.delete(`view_request|${requestId}`);
    this.emit({ type: "leave_request", request_id: requestId });
  }

  joinChat(requestId: string): void {
    this.rooms.add(`join_chat|${requestId}`);
    this.emit({ type: "join_chat", request_id: requestId });
  }

  leaveChat(requestId: string): void {
    this.rooms.delete(`join_chat|${requestId}`);
    this.emit({ type: "leave_request", request_id: requestId });
  }

  heartbeat(lat: number, lng: number): void {
    this.emit({ type: "heartbeat", lat, lng });
  }

  ping(): void {
    this.emit({ type: "ping" });
  }
}

export const ws = new WsClient();
