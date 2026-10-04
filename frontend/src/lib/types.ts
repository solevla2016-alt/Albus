export interface User {
  id: number;
  username: string;
  email?: string;
  avatar: string | null;
  status: string;
  birth_date?: string | null;
  message_privacy?: "everyone" | "contacts" | "nobody";
  role?: "member" | "moderator" | "admin";
  is_staff?: boolean;
  is_ai?: boolean;
}

export interface ReplyTo {
  id: number;
  username: string;
  text: string;
}

export interface ReactionItem {
  emoji: string;
  username: string;
}

export interface Message {
  id: number;
  username: string;
  avatar: string | null;
  message: string;
  created_at: string;
  is_edited: boolean;
  reply_to: ReplyTo | null;
  forwarded_from?: ReplyTo | null;
  reactions: ReactionItem[];
  attachment_type: "none" | "image" | "audio" | "video" | "file";
  attachment_url: string | null;
  attachment_name: string;
  duration: number | null;
  is_ai?: boolean;
  pinned?: boolean;
  transcription?: string;
}

export interface ChatRoomMember {
  id: number;
  username: string;
  avatar: string | null;
  role?: "member" | "moderator" | "admin";
  is_ai?: boolean;
}

export interface RoomBan {
  username: string;
  user_id: number;
  banned_by: string;
  reason: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface Server {
  id: number;
  name: string;
  description: string;
  avatar: string | null;
  owner: string;
  member_count: number;
  created_at: string;
}

export interface ChatRoom {
  id: number;
  name: string;
  description: string;
  avatar: string | null;
  is_private: boolean;
  room_type: "group" | "channel" | "direct";
  owner: string;
  member_count: number;
  members?: ChatRoomMember[];
  unread_count?: number;
  server: number | null;
  server_name?: string;
  is_ai?: boolean;
  peer_id?: number | null;
  peer_username?: string | null;
  last_message: {
    text: string;
    username: string;
    created_at: string;
  } | null;
  created_at: string;
}

export interface TypingUser {
  username: string;
  timeout: ReturnType<typeof setTimeout>;
}

export interface OnlineUser {
  username: string;
  avatar: string | null;
}

export type CallMode = "audio" | "video";

export type CallPhase = "calling" | "ringing" | "connecting" | "active" | "ended";

export interface CallState {
  id: string;
  peer: string;
  mode: CallMode;
  direction: "outgoing" | "incoming";
  phase: CallPhase;
  endReason?: string;
}

export interface WebSocketMessage {
  type: string;
  id?: number;
  username?: string;
  avatar?: string | null;
  message?: string;
  created_at?: string;
  is_edited?: boolean;
  reply_to?: ReplyTo | null;
  forwarded_from?: ReplyTo | null;
  reactions?: ReactionItem[];
  attachment_type?: "none" | "image" | "audio" | "video" | "file";
  attachment_url?: string | null;
  attachment_name?: string;
  duration?: number | null;
  is_ai?: boolean;
  is_own?: boolean;
  is_typing?: boolean;
  ai_typing?: boolean;
  pinned?: boolean;
  pinned_by?: string;
  transcription?: string;
  action?: string;
  users?: OnlineUser[];
  messages?: Message[];
  error?: string;
  updated_at?: string;
  broadcaster?: string;
  from?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  signal_type?: string;
  call_id?: string;
  mode?: CallMode;
  room_id?: number;
  room_name?: string;
  room_type?: string;
  server_id?: number | null;
  server_name?: string | null;
  last_message?: {
    text: string;
    username: string;
    created_at: string;
  } | null;
  unread_count?: number;
}
