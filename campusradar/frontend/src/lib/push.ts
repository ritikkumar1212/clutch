/* Web Push: register SW, ask permission, subscribe with VAPID key from the API. */
import { api } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("SW registration failed", e);
    return null;
  }
}

export async function enablePushNotifications(): Promise<{ ok: boolean; detail: string }> {
  if (!("serviceWorker" in navigator)) return { ok: false, detail: "Service worker unsupported" };
  if (!("PushManager" in window)) return { ok: false, detail: "Push unsupported — on iOS, install to Home Screen first (iOS 16.4+)" };

  const reg = await navigator.serviceWorker.ready;
  const cfg = await api<{ vapid_public_key: string | null }>("/config/public");
  if (!cfg.vapid_public_key) {
    return { ok: false, detail: "Push not configured on the server (set VAPID keys in backend/.env)" };
  }

  let permission = Notification.permission;
  if (permission === "default") {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") return { ok: false, detail: "Notification permission denied" };

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(cfg.vapid_public_key) as BufferSource,
    }));

  const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> };
  await api("/users/push-subscription", { method: "POST", body: JSON.stringify(json) });
  return { ok: true, detail: "Push notifications enabled" };
}
