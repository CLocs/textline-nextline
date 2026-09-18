import { getSessionToken } from "../auth/session.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function groupsFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
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

export type GroupMember = {
  userId: string;
  displayName: string;
};

export type FriendGroup = {
  id: string;
  name: string;
  createdAt: string;
  members: GroupMember[];
};

export async function fetchGroups(): Promise<FriendGroup[] | { error: string }> {
  const response = await groupsFetch("/api/groups");
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load groups") };
  const data = (await response.json()) as { groups?: FriendGroup[] };
  return Array.isArray(data.groups) ? data.groups : [];
}

export async function createFriendGroup(name: string): Promise<FriendGroup | { error: string }> {
  const response = await groupsFetch("/api/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not create group") };
  return (await response.json()) as FriendGroup;
}

export async function addFriendToGroup(
  groupId: string,
  userId: string,
): Promise<{ ok: true } | { error: string }> {
  const response = await groupsFetch(`/api/groups/${encodeURIComponent(groupId)}/members`, {
    method: "POST",
    body: JSON.stringify({ userId }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not add to group") };
  return { ok: true };
}

export async function removeFriendFromGroup(
  groupId: string,
  userId: string,
): Promise<{ ok: true } | { error: string }> {
  const response = await groupsFetch(
    `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not remove from group") };
  return { ok: true };
}

export async function deleteFriendGroup(groupId: string): Promise<{ ok: true } | { error: string }> {
  const response = await groupsFetch(`/api/groups/${encodeURIComponent(groupId)}`, {
    method: "DELETE",
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Could not delete group") };
  return { ok: true };
}
