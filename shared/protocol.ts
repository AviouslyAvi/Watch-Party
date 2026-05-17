export const PROTOCOL_VERSION = 1;

export type ClientId = string;

export type SyncMsg =
  | { type: "play"; at: number; ts: number }
  | { type: "pause"; at: number; ts: number }
  | { type: "seek"; at: number; ts: number }
  | { type: "state"; at: number; paused: boolean; ts: number };

export type ChatMsg = {
  type: "chat";
  from: ClientId;
  name: string;
  text: string;
  ts: number;
};

export const REACTION_EMOJIS = ["❤️", "😂", "🔥", "👏", "😮", "👀"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type ReactionMsg = {
  type: "reaction";
  from: ClientId;
  name: string;
  emoji: ReactionEmoji;
  ts: number;
};

export function isReactionEmoji(s: unknown): s is ReactionEmoji {
  return typeof s === "string" && (REACTION_EMOJIS as readonly string[]).includes(s);
}

export type PresenceMsg =
  | { type: "hello"; name: string; pathname: string; v: number; passphrase?: string }
  | { type: "welcome"; you: ClientId; adminId: ClientId; freeForAll: boolean; participants: Participant[]; lastState: SyncMsg | null }
  | { type: "participants"; participants: Participant[]; adminId: ClientId }
  | { type: "ffa"; freeForAll: boolean }
  | { type: "revert"; at: number; paused: boolean }
  | { type: "pathDiff"; theirPath: string; yourPath: string }
  | { type: "rejected"; reason: "passphrase" };

export type Participant = { id: ClientId; name: string; isAdmin: boolean };

export type WireMsg = SyncMsg | ChatMsg | ReactionMsg | PresenceMsg;

export function isSyncMsg(m: WireMsg): m is SyncMsg {
  return m.type === "play" || m.type === "pause" || m.type === "seek" || m.type === "state";
}
