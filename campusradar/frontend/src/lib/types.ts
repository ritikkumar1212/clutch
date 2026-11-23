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
  avatar_url: string | null;
  avatar_visibility: "private" | "accepted_only" | "public";
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
  lat: number | null;
  lng: number | null;
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

export interface HistoryItem {
  id: string;
  description: string;
  landmark: string | null;
  status: Extract<RequestStatus, "completed" | "cancelled" | "expired">;
  role: "helper" | "requester";
  other_user: PublicUser | null;
  created_at: string | null;
  accepted_at: string | null;
  completed_at: string | null;
  points_awarded: number;
  completion_pin: string | null;
}

export interface ChatMessage {
  id: number;
  request_id: string;
  sender_id: string | null;
  kind: "text" | "quick" | "system" | "attachment" | "audio";
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

export interface SharedLocations {
  requester: { lat: number; lng: number } | null;
  helper: { lat: number; lng: number } | null;
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
  call_signal: {
    request_id: string;
    sender_id: string;
    signal: "offer" | "answer" | "ice" | "hangup";
    data?: unknown;
  };
  points_awarded: { points: number; total: number; request_id: string };
  error: { request_id: string; code: number; detail: string };
  pong: { online_users: number };
}
export type WsEventType = keyof WsEvents;
export type WsHandler = (payload: never) => void;
