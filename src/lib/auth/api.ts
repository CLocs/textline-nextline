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

export async function fetchAuthConfig(): Promise<{ googleClientId: string | null }> {
  const response = await authFetch("/api/auth/config");
  if (!response?.ok) {
    const fromEnv = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
    return { googleClientId: fromEnv || null };
  }
  const data = (await response.json()) as { googleClientId?: string | null };
  const fromApi = data.googleClientId?.trim() || null;
  if (fromApi) return { googleClientId: fromApi };
  const fromEnv = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  return { googleClientId: fromEnv || null };
}

export async function signInWithGoogleIdToken(
  idToken: string,
): Promise<{ user: AuthUser } | { error: string }> {
  const response = await authFetch("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Google sign-in failed" };
  }
  const data = (await response.json()) as { user: AuthUser; sessionToken: string };
  setSession(data.sessionToken, data.user);
  return { user: data.user };
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

export async function uploadMyAvatar(jpeg: Blob): Promise<{ avatarAt: string } | { error: string }> {
  const response = await authFetch("/api/auth/me/avatar", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: jpeg,
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not save photo" };
  }
  return (await response.json()) as { avatarAt: string };
}

export async function removeMyAvatar(): Promise<{ avatarAt: null } | { error: string }> {
  const response = await authFetch("/api/auth/me/avatar", { method: "DELETE" });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not remove photo" };
  }
  return { avatarAt: null };
}

export async function fetchAvatarObjectUrl(userId: string): Promise<string | null> {
  const response = await authFetch(`/api/avatars/${encodeURIComponent(userId)}`);
  if (!response?.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function prepareAvatarFile(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that image"));
        return;
      }
      const scale = Math.max(size / image.width, size / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) reject(new Error("Could not read that image"));
          else resolve(blob);
        },
        "image/jpeg",
        0.85,
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    image.src = url;
  });
}

export async function fetchDailyMailPreference(): Promise<{ optedIn: boolean } | { error: string }> {
  const response = await authFetch("/api/daily/mail");
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not load daily quotes" };
  }
  const data = (await response.json()) as { optedIn?: boolean };
  return { optedIn: Boolean(data.optedIn) };
}

export async function setDailyMailPreference(
  optedIn: boolean,
): Promise<{ optedIn: boolean } | { error: string }> {
  const response = await authFetch("/api/daily/mail", {
    method: "PUT",
    body: JSON.stringify({ optedIn }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not update daily quotes" };
  }
  const data = (await response.json()) as { optedIn?: boolean };
  return { optedIn: Boolean(data.optedIn) };
}

export async function unsubscribeDailyMail(token: string): Promise<{ ok: true } | { error: string }> {
  const response = await authFetch("/api/daily/mail/unsubscribe", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not unsubscribe" };
  }
  return { ok: true };
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
