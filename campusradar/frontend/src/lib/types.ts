export type Gender = "male" | "female" | "other";
export type RequestStatus = "open" | "accepted" | "completed" | "expired" | "cancelled";

export interface User {
  id: string;
  phone: string;
  handle: string;
  gender: Gender;
  gender_verified: boolean;
  upi_vpa: string | null;
  help_points: number;
  profile_complete: boolean;
}

export interface PublicUser {
  handle: string;
  gender: Gender;
  gender_verified: boolean;
}

export interface RequestCard {
  id: string;
  description: string;
  landmark: string | null;
  lat: number;
  lng: number;
  gender_filter: "everyone" | "female_only";
  status: RequestStatus;
  expires_at: string;
  created_at: string | null;
  requester: PublicUser;
  helper?: PublicUser | null;
  viewer_count?: number | null;
  viewers_hint?: string | null;
  has_pin?: boolean;
}

export interface ChatMessage {
  id: number;
  request_id: string;
  sender_id: string | null;
  kind: "text" | "quick" | "system";
  body: string;
  created_at: string;
}

export interface ChatRoom {
  request_id: string;
  role: "requester" | "helper";
  counterpart: PublicUser;
  status: RequestStatus;
  archived: boolean;
  lock_at: string | null;
  tip_amount: number;
  messages: ChatMessage[];
}

export interface LedgerRow {
  id: number;
  points: number;
  reason: string;
  note: string | null;
  request_id: string | null;
  created_at: string;
}

export interface LeaderboardRow {
  rank: number;
  handle: string;
  gender: Gender;
  help_points: number;
}

/* -------------------------------------------------- WS event map ---------- */
export interface WsEvents {
  viewer_count: { request_id: string; count: number; hint?: string };
  new_request: { request: RequestCard };
  request_locked: { request_id: string; helper: PublicUser };
  request_completed: { request_id: string; points_awarded: number; helper_total: number };
  request_expired: { request_id: string };
  request_cancelled: { request_id: string };
  feed_removed: { request_id: string };
  chat_message: { message: ChatMessage };
  chat_typing: { request_id: string; handle: string };
  chat_locked: { request_id: string };
  points_awarded: { points: number; total: number; request_id: string };
  error: { request_id: string; code: number; detail: string };
  pong: { online_users: number };
}
export type WsEventType = keyof WsEvents;
export type WsHandler = (payload: never) => void;
