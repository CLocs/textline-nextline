import { getOrCreatePlayerId } from "./playerId.js";
import { getSessionToken } from "../auth/session.js";

export type PopularStar = {
  lineIndex: number;
  count: number;
};

export type MyStar = {
  lineIndex: number;
  loved: boolean;
};

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

function apiEnabled(): boolean {
  return apiBaseUrl() !== null;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = apiBaseUrl();
  if (!base) return null;

  const headers = new Headers(init.headers);
  headers.set("X-Player-Id", getOrCreatePlayerId());
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

export function isStarApiEnabled(): boolean {
  return apiEnabled();
}

export async function starLine(titleId: string, lineIndex: number): Promise<boolean> {
  const response = await apiFetch("/api/stars", {
    method: "PUT",
    body: JSON.stringify({ titleId, lineIndex }),
  });
  return response?.ok ?? false;
}

export async function unstarLine(titleId: string, lineIndex: number): Promise<boolean> {
  const response = await apiFetch("/api/stars", {
    method: "DELETE",
    body: JSON.stringify({ titleId, lineIndex }),
  });
  return response?.ok ?? false;
}

export async function loveLine(
  titleId: string,
  lineIndex: number,
  loved: boolean,
): Promise<boolean> {
  const response = await apiFetch("/api/stars/love", {
    method: "PUT",
    body: JSON.stringify({ titleId, lineIndex, loved }),
  });
  return response?.ok ?? false;
}

export async function fetchMyStars(titleId: string): Promise<MyStar[] | null> {
  const response = await apiFetch(
    `/api/stars/mine?titleId=${encodeURIComponent(titleId)}`,
  );
  if (!response?.ok) return null;
  const data = (await response.json()) as {
    stars?: MyStar[];
    lineIndices?: number[];
    lovedIndices?: number[];
  };
  if (Array.isArray(data.stars)) {
    return data.stars.filter(
      (s) => typeof s.lineIndex === "number" && typeof s.loved === "boolean",
    );
  }
  // Backward compat if an older Worker is still live
  if (Array.isArray(data.lineIndices)) {
    const loved = new Set(data.lovedIndices ?? []);
    return data.lineIndices.map((lineIndex) => ({
      lineIndex,
      loved: loved.has(lineIndex),
    }));
  }
  return [];
}

export async function fetchPopularStars(
  titleId: string,
  limit = 50,
): Promise<PopularStar[] | null> {
  const response = await apiFetch(
    `/api/stars/popular?titleId=${encodeURIComponent(titleId)}&limit=${limit}`,
  );
  if (!response?.ok) return null;
  const data = (await response.json()) as { popular?: PopularStar[] };
  if (!Array.isArray(data.popular)) return [];
  return data.popular.filter(
    (entry) =>
      typeof entry.lineIndex === "number" && typeof entry.count === "number",
  );
}
