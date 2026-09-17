import { getSessionToken, type AuthUser } from "../auth/session.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function friendsFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
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

export type FriendListItem = {
  userId: string;
  displayName: string;
};

export type InvitePreview = {
  displayName: string;
  isSelf?: boolean;
  alreadyFriends?: boolean;
};

export type InviteLink = {
  url: string | null;
  expiresAt: string;
  reused: boolean;
};

export async function fetchInvitePreview(token: string): Promise<InvitePreview | { error: string }> {
  const response = await friendsFetch(`/api/friends/invite/${encodeURIComponent(token)}`);
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Invite not found") };
  return (await response.json()) as InvitePreview;
}

export async function fetchOrCreateInvite(): Promise<InviteLink | { error: string }> {
  const response = await friendsFetch("/api/friends/invite", { method: "POST" });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not create friend link") };
  return (await response.json()) as InviteLink;
}

export async function rotateFriendInvite(): Promise<InviteLink | { error: string }> {
  const response = await friendsFetch("/api/friends/invite/rotate", { method: "POST" });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not rotate friend link") };
  return (await response.json()) as InviteLink;
}

export async function acceptFriendInvite(
  token: string,
): Promise<{ ok: true; alreadyFriends?: boolean } | { error: string }> {
  const response = await friendsFetch("/api/friends/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in to accept" };
  if (!response.ok) return { error: await readError(response, "Could not accept invite") };
  return (await response.json()) as { ok: true; alreadyFriends?: boolean };
}

export async function fetchFriends(): Promise<FriendListItem[] | { error: string }> {
  const response = await friendsFetch("/api/friends");
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load friends") };
  const data = (await response.json()) as { friends?: FriendListItem[] };
  return Array.isArray(data.friends) ? data.friends : [];
}

export async function unfriendUser(userId: string): Promise<{ ok: true } | { error: string }> {
  const response = await friendsFetch(`/api/friends/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not remove friend") };
  return { ok: true };
}

export async function blockFriend(userId: string): Promise<{ ok: true } | { error: string }> {
  const response = await friendsFetch(`/api/friends/${encodeURIComponent(userId)}/block`, {
    method: "POST",
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not block") };
  return { ok: true };
}

const INVITE_STORE_PREFIX = "textline-friend-invite:";

export function storedInviteUrl(user: AuthUser): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(`${INVITE_STORE_PREFIX}${user.id}`);
}

export function rememberInviteUrl(user: AuthUser, url: string | null): void {
  if (typeof localStorage === "undefined") return;
  const key = `${INVITE_STORE_PREFIX}${user.id}`;
  if (url) localStorage.setItem(key, url);
  else localStorage.removeItem(key);
}
