/* Tiny API client: JSON fetch + bearer token + 401 handling. */

const browserHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
const browserProtocol = typeof window !== "undefined" ? window.location.protocol : "http:";
const socketProtocol = browserProtocol === "https:" ? "wss:" : "ws:";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || `http://${browserHost}:8000/api/v1`;
export const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE || `${socketProtocol}//${browserHost}:8000/ws`;

const TOKEN_KEY = "cr_token";
const USER_KEY = "cr_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): import("./types").User | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function setSession(token: string, user: import("./types").User): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function updateUser(user: import("./types").User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body !== undefined && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Cannot reach CampusRadar server — is the backend running?");
  }

  if (res.status === 401 && !path.startsWith("/auth/")) {
    clearSession();
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Session expired");
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}
