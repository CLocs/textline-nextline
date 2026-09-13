import { getOrCreatePlayerId } from "../stars/playerId.js";
import {
  clearSession,
  getSessionToken,
  setSession,
  type AuthUser,
} from "./session.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

export function isAuthApiEnabled(): boolean {
  return apiBaseUrl() !== null;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
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

export async function requestMagicLink(
  email: string,
  returnTo?: string,
): Promise<{ ok: true } | { error: string }> {
  const response = await authFetch("/api/auth/request-link", {
    method: "POST",
    body: JSON.stringify({ email, returnTo: returnTo || undefined }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not send sign-in link" };
  }
  return { ok: true };
}

export async function verifyMagicLink(
  token: string,
): Promise<{ user: AuthUser } | { error: string }> {
  const response = await authFetch("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Invalid or expired link" };
  }
  const data = (await response.json()) as { user: AuthUser; sessionToken: string };
  setSession(data.sessionToken, data.user);
  return { user: data.user };
}

export async function fetchMe(): Promise<AuthUser | null> {
  const response = await authFetch("/api/auth/me");
  if (!response?.ok) return null;
  const data = (await response.json()) as { user: AuthUser };
  const session = getSessionToken();
  if (session) setSession(session, data.user);
  return data.user;
}

export async function updateMyDisplayName(
  displayName: string,
): Promise<{ user: AuthUser } | { error: string }> {
  const response = await authFetch("/api/auth/me", {
    method: "PATCH",
    body: JSON.stringify({ displayName }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not update display name" };
  }
  const data = (await response.json()) as { user: AuthUser };
  const session = getSessionToken();
  if (session) setSession(session, data.user);
  return { user: data.user };
}

export async function logout(): Promise<void> {
  await authFetch("/api/auth/logout", { method: "POST" });
  clearSession();
}

export async function claimAnonymousPlayer(): Promise<number> {
  const response = await authFetch("/api/auth/claim", {
    method: "POST",
    body: JSON.stringify({ anonymousPlayerId: getOrCreatePlayerId() }),
  });
  if (!response?.ok) return 0;
  const data = (await response.json()) as { claimed?: number };
  return data.claimed ?? 0;
}

export type ShareMeta = {
  shareId: string;
  titleId: string;
  ownerDisplayName: string;
  ownerEmail: string;
  starCount: number;
  createdAt: string;
};

export type SharedRun = {
  playerUserId: string;
  displayName: string;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  completedAt: string;
};

export async function createMiniShare(
  titleId: string,
): Promise<{ shareId: string; url: string } | { error: string }> {
  const response = await authFetch("/api/shares", {
    method: "POST",
    body: JSON.stringify({ titleId }),
  });
  if (!response) return { error: "API unavailable — sign in requires VITE_API_URL" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not create share link" };
  }
  return (await response.json()) as { shareId: string; url: string };
}

export async function fetchShareMeta(
  shareId: string,
): Promise<ShareMeta | { error: string; status?: number }> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(shareId)}`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in to play this mini-game", status: 401 };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Share not found", status: response.status };
  }
  const data = (await response.json()) as { share: ShareMeta };
  return data.share;
}

export async function fetchShareQueue(
  shareId: string,
): Promise<{ titleId: string; lineIndices: number[]; frozen: boolean } | { error: string; status?: number }> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(shareId)}/queue`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in to play this mini-game", status: 401 };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Share not found", status: response.status };
  }
  const data = (await response.json()) as {
    titleId?: string;
    lineIndices?: number[];
    frozen?: boolean;
  };
  return {
    titleId: data.titleId ?? "",
    lineIndices: Array.isArray(data.lineIndices) ? data.lineIndices : [],
    frozen: Boolean(data.frozen),
  };
}

export async function submitSharedRun(
  shareId: string,
  scores: { correctCount: number; wrongCount: number; skipCount: number },
): Promise<boolean> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(shareId)}/runs`, {
    method: "POST",
    body: JSON.stringify(scores),
  });
  return response?.ok ?? false;
}

export async function fetchSharedRuns(
  shareId: string,
): Promise<SharedRun[]> {
  const response = await authFetch(`/api/shares/${encodeURIComponent(shareId)}/runs`);
  if (!response?.ok) return [];
  const data = (await response.json()) as { runs?: SharedRun[] };
  return Array.isArray(data.runs) ? data.runs : [];
}
