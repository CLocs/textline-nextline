import { getSessionToken } from "../auth/session.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function inboxFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
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

export type LineShare = {
  shareId: string;
  url: string;
};

export type InboxItem = {
  id: string;
  shareId: string;
  titleId: string;
  lineIndex: number;
  from: { userId: string; displayName: string };
  createdAt: string;
};

export async function copyLineShare(
  titleId: string,
  lineIndex: number,
): Promise<LineShare | { error: string }> {
  const response = await inboxFetch("/api/inbox/share", {
    method: "POST",
    body: JSON.stringify({ titleId, lineIndex }),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not copy link") };
  return (await response.json()) as LineShare;
}

export async function sendLineToFriend(
  titleId: string,
  lineIndex: number,
  toUserId: string,
): Promise<LineShare | { error: string }> {
  const response = await inboxFetch("/api/inbox", {
    method: "POST",
    body: JSON.stringify({ titleId, lineIndex, toUserId }),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not send line") };
  return (await response.json()) as LineShare;
}

export async function fetchInbox(): Promise<InboxItem[] | { error: string }> {
  const response = await inboxFetch("/api/inbox");
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load inbox") };
  const data = (await response.json()) as { items?: InboxItem[] };
  return Array.isArray(data.items) ? data.items : [];
}
