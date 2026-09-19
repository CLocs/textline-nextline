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
      unreadCount: number;
    }
  | {
      kind: "group";
      groupId: string;
      name: string;
      memberCount: number;
      lastAt: string;
      lastPreview: string;
      unreadCount: number;
    };

export type DmMessage = {
  id: string;
  shareId: string;
  titleId: string;
  lineIndex: number;
  direction: "in" | "out";
  from: { userId: string; displayName: string };
  createdAt: string;
  playable: boolean;
};

export type GroupMessage = {
  shareId: string;
  titleId: string;
  lineIndex: number;
  from: { userId: string; displayName: string };
  createdAt: string;
  sentCount: number;
  inboxId: string | null;
  playable: boolean;
  youSent: boolean;
};

export async function fetchChats(): Promise<ChatThreadSummary[] | { error: string }> {
  const response = await chatsFetch("/api/chats");
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load chats") };
  const data = (await response.json()) as { threads?: ChatThreadSummary[] };
  return Array.isArray(data.threads) ? data.threads : [];
}

export async function fetchDmThread(
  peerUserId: string,
): Promise<
  { peer: { userId: string; displayName: string }; messages: DmMessage[] } | { error: string }
> {
  const response = await chatsFetch(`/api/chats/dm/${encodeURIComponent(peerUserId)}`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load chat") };
  const data = (await response.json()) as {
    peer?: { userId?: string; displayName?: string };
    messages?: DmMessage[];
  };
  return {
    peer: {
      userId: typeof data.peer?.userId === "string" ? data.peer.userId : peerUserId,
      displayName:
        typeof data.peer?.displayName === "string" && data.peer.displayName.trim()
          ? data.peer.displayName
          : "Friend",
    },
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

export async function fetchGroupThread(
  groupId: string,
): Promise<{ name: string; messages: GroupMessage[] } | { error: string }> {
  const response = await chatsFetch(`/api/chats/group/${encodeURIComponent(groupId)}`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load group chat") };
  const data = (await response.json()) as { name?: string; messages?: GroupMessage[] };
  return {
    name: typeof data.name === "string" ? data.name : "Group",
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
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
