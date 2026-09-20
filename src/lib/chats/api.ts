import { getSessionToken } from "../auth/session.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function chatsFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = apiBaseUrl();
  if (!base) return null;

  const headers = new Headers(init.headers);
  const session = getSessionToken();
  if (session) headers.set("Authorization", `Bearer ${session}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers });
  } catch {
    return null;
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

export type ChatThreadSummary =
  | {
      kind: "dm";
      peerUserId: string;
      displayName: string;
      lastAt: string;
      lastPreview: string;
      lastDirection: "in" | "out";
      quoteUnreadCount: number;
      textUnreadCount: number;
      unreadCount: number;
    }
  | {
      kind: "group";
      groupId: string;
      name: string;
      memberCount: number;
      lastAt: string;
      lastPreview: string;
      quoteUnreadCount: number;
      textUnreadCount: number;
      unreadCount: number;
    };

export type ChatReaction = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🔥"] as const;

export type ChatTextMessage = {
  kind: "text";
  id: string;
  body: string;
  from: { userId: string; displayName: string };
  createdAt: string;
  youSent: boolean;
  reactions: ChatReaction[];
};

export type DmQuoteMessage = {
  kind: "quote";
  id: string;
  shareId: string;
  titleId: string;
  lineIndex: number;
  direction: "in" | "out";
  from: { userId: string; displayName: string };
  createdAt: string;
  playable: boolean;
  receipt: "sent" | "read" | null;
  reactions: ChatReaction[];
};

export type GroupQuoteMessage = {
  kind: "quote";
  shareId: string;
  titleId: string;
  lineIndex: number;
  from: { userId: string; displayName: string };
  createdAt: string;
  sentCount: number;
  readCount: number;
  inboxId: string | null;
  playable: boolean;
  youSent: boolean;
  reactions: ChatReaction[];
};

export type DmThreadMessage = DmQuoteMessage | ChatTextMessage;
export type GroupThreadMessage = GroupQuoteMessage | ChatTextMessage;

/** @deprecated Prefer DmQuoteMessage */
export type DmMessage = DmQuoteMessage;
/** @deprecated Prefer GroupQuoteMessage */
export type GroupMessage = GroupQuoteMessage;

function asUnreadCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizeThread(thread: ChatThreadSummary): ChatThreadSummary {
  const quoteUnreadCount = asUnreadCount(thread.quoteUnreadCount ?? thread.unreadCount);
  const textUnreadCount = asUnreadCount(thread.textUnreadCount);
  const unreadCount = asUnreadCount(thread.unreadCount) || quoteUnreadCount + textUnreadCount;
  return { ...thread, quoteUnreadCount, textUnreadCount, unreadCount };
}

function normalizeReactions(raw: unknown): ChatReaction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      const item = row as { emoji?: unknown; count?: unknown; reacted?: unknown };
      if (typeof item.emoji !== "string") return null;
      return {
        emoji: item.emoji,
        count: typeof item.count === "number" ? item.count : 0,
        reacted: Boolean(item.reacted),
      };
    })
    .filter((row): row is ChatReaction => row !== null);
}

function normalizeDmMessage(raw: Record<string, unknown>): DmThreadMessage | null {
  if (raw.kind === "text" || (typeof raw.body === "string" && !raw.shareId && !raw.titleId)) {
    if (typeof raw.id !== "string" || typeof raw.body !== "string") return null;
    const from = raw.from as { userId?: string; displayName?: string } | undefined;
    return {
      kind: "text",
      id: raw.id,
      body: raw.body,
      from: {
        userId: typeof from?.userId === "string" ? from.userId : "",
        displayName: typeof from?.displayName === "string" ? from.displayName : "Friend",
      },
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      youSent: Boolean(raw.youSent),
      reactions: normalizeReactions(raw.reactions),
    };
  }
  if (typeof raw.id !== "string" || typeof raw.titleId !== "string") return null;
  const from = raw.from as { userId?: string; displayName?: string } | undefined;
  const receipt = raw.receipt;
  return {
    kind: "quote",
    id: raw.id,
    shareId: typeof raw.shareId === "string" ? raw.shareId : "",
    titleId: raw.titleId,
    lineIndex: typeof raw.lineIndex === "number" ? raw.lineIndex : 0,
    direction: raw.direction === "out" ? "out" : "in",
    from: {
      userId: typeof from?.userId === "string" ? from.userId : "",
      displayName: typeof from?.displayName === "string" ? from.displayName : "Friend",
    },
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    playable: Boolean(raw.playable),
    receipt: receipt === "sent" || receipt === "read" ? receipt : null,
    reactions: normalizeReactions(raw.reactions),
  };
}

function normalizeGroupMessage(raw: Record<string, unknown>): GroupThreadMessage | null {
  if (raw.kind === "text" || (typeof raw.body === "string" && !raw.shareId && !raw.titleId)) {
    if (typeof raw.id !== "string" || typeof raw.body !== "string") return null;
    const from = raw.from as { userId?: string; displayName?: string } | undefined;
    return {
      kind: "text",
      id: raw.id,
      body: raw.body,
      from: {
        userId: typeof from?.userId === "string" ? from.userId : "",
        displayName: typeof from?.displayName === "string" ? from.displayName : "Friend",
      },
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
      youSent: Boolean(raw.youSent),
      reactions: normalizeReactions(raw.reactions),
    };
  }
  if (typeof raw.shareId !== "string" || typeof raw.titleId !== "string") return null;
  const from = raw.from as { userId?: string; displayName?: string } | undefined;
  return {
    kind: "quote",
    shareId: raw.shareId,
    titleId: raw.titleId,
    lineIndex: typeof raw.lineIndex === "number" ? raw.lineIndex : 0,
    from: {
      userId: typeof from?.userId === "string" ? from.userId : "",
      displayName: typeof from?.displayName === "string" ? from.displayName : "Friend",
    },
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    sentCount: typeof raw.sentCount === "number" ? raw.sentCount : 0,
    readCount: typeof raw.readCount === "number" ? raw.readCount : 0,
    inboxId: typeof raw.inboxId === "string" ? raw.inboxId : null,
    playable: Boolean(raw.playable),
    youSent: Boolean(raw.youSent),
    reactions: normalizeReactions(raw.reactions),
  };
}

export async function fetchChats(): Promise<ChatThreadSummary[] | { error: string }> {
  const response = await chatsFetch("/api/chats");
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load chats") };
  const data = (await response.json()) as { threads?: ChatThreadSummary[] };
  return Array.isArray(data.threads) ? data.threads.map(normalizeThread) : [];
}

export async function fetchDmThread(
  peerUserId: string,
): Promise<
  { peer: { userId: string; displayName: string }; messages: DmThreadMessage[] } | { error: string }
> {
  const response = await chatsFetch(`/api/chats/dm/${encodeURIComponent(peerUserId)}`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load chat") };
  const data = (await response.json()) as {
    peer?: { userId?: string; displayName?: string };
    messages?: Record<string, unknown>[];
  };
  return {
    peer: {
      userId: typeof data.peer?.userId === "string" ? data.peer.userId : peerUserId,
      displayName:
        typeof data.peer?.displayName === "string" && data.peer.displayName.trim()
          ? data.peer.displayName
          : "Friend",
    },
    messages: Array.isArray(data.messages)
      ? data.messages
          .map((row) => normalizeDmMessage(row))
          .filter((row): row is DmThreadMessage => row !== null)
      : [],
  };
}

export async function fetchGroupThread(
  groupId: string,
): Promise<{ name: string; messages: GroupThreadMessage[] } | { error: string }> {
  const response = await chatsFetch(`/api/chats/group/${encodeURIComponent(groupId)}`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load group chat") };
  const data = (await response.json()) as { name?: string; messages?: Record<string, unknown>[] };
  return {
    name: typeof data.name === "string" ? data.name : "Group",
    messages: Array.isArray(data.messages)
      ? data.messages
          .map((row) => normalizeGroupMessage(row))
          .filter((row): row is GroupThreadMessage => row !== null)
      : [],
  };
}

export async function postDmChatMessage(
  peerUserId: string,
  body: string,
): Promise<{ message: ChatTextMessage } | { error: string }> {
  const response = await chatsFetch(`/api/chats/dm/${encodeURIComponent(peerUserId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not send message") };
  const data = (await response.json()) as { message?: ChatTextMessage };
  if (!data.message || data.message.kind !== "text") return { error: "Could not send message" };
  return {
    message: {
      ...data.message,
      reactions: normalizeReactions(data.message.reactions),
    },
  };
}

export async function postGroupChatMessage(
  groupId: string,
  body: string,
): Promise<{ message: ChatTextMessage } | { error: string }> {
  const response = await chatsFetch(`/api/chats/group/${encodeURIComponent(groupId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not send message") };
  const data = (await response.json()) as { message?: ChatTextMessage };
  if (!data.message || data.message.kind !== "text") return { error: "Could not send message" };
  return {
    message: {
      ...data.message,
      reactions: normalizeReactions(data.message.reactions),
    },
  };
}

export async function toggleChatReaction(input: {
  targetKind: "text" | "quote";
  targetId: string;
  emoji: string;
  peerUserId?: string;
  groupId?: string;
}): Promise<{ reactions: ChatReaction[] } | { error: string }> {
  const response = await chatsFetch("/api/chats/reactions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not react") };
  const data = (await response.json()) as { reactions?: unknown };
  return { reactions: normalizeReactions(data.reactions) };
}

export async function markDmRead(peerUserId: string): Promise<{ ok: true } | { error: string }> {
  const response = await chatsFetch(`/api/chats/dm/${encodeURIComponent(peerUserId)}/read`, {
    method: "POST",
    body: "{}",
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not mark read") };
  return { ok: true };
}

export async function markGroupRead(groupId: string): Promise<{ ok: true } | { error: string }> {
  const response = await chatsFetch(`/api/chats/group/${encodeURIComponent(groupId)}/read`, {
    method: "POST",
    body: "{}",
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not mark read") };
  return { ok: true };
}

export function chatsUnreadTotal(threads: ChatThreadSummary[]): number {
  return threads.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0);
}

export function chatsUnreadBreakdown(threads: ChatThreadSummary[]): {
  quote: number;
  text: number;
} {
  return threads.reduce(
    (acc, thread) => ({
      quote: acc.quote + (thread.quoteUnreadCount || 0),
      text: acc.text + (thread.textUnreadCount || 0),
    }),
    { quote: 0, text: 0 },
  );
}
