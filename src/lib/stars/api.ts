import { getOrCreatePlayerId } from "./playerId.js";
import { getSessionToken } from "../auth/session.js";

export type PopularStar = {
  lineIndex: number;
  count: number;
};

export type MyStar = {
  lineIndex: number;
  loved: boolean;
  origin?: "mine" | "wikiquote";
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
    wikiquoteIndices?: number[];
  };
  if (Array.isArray(data.stars)) {
    const parsed = data.stars.filter(
      (s) => typeof s.lineIndex === "number" && typeof s.loved === "boolean",
    );
    if (parsed.some((star) => star.origin === "mine" || star.origin === "wikiquote")) {
      return parsed.map((star) => ({
        ...star,
        origin: star.origin === "wikiquote" ? "wikiquote" : "mine",
      }));
    }
  }
  // Older Worker: stars or lineIndices, plus an optional wikiquote index list.
  const lineIndices = Array.isArray(data.stars)
    ? data.stars.map((star) => star.lineIndex)
    : data.lineIndices;
  if (Array.isArray(lineIndices)) {
    const loved = new Set(data.lovedIndices ?? []);
    const wiki = new Set(data.wikiquoteIndices ?? []);
    return lineIndices.map((lineIndex) => ({
      lineIndex,
      loved: loved.has(lineIndex),
      origin: wiki.has(lineIndex) ? ("wikiquote" as const) : ("mine" as const),
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

export type GlobalPopularStar = {
  titleId: string;
  lineIndex: number;
  count: number;
};

export type GlobalLovedStar = {
  titleId: string;
  lineIndex: number;
};

export async function fetchLovedStarsGlobal(
  limit = 200,
): Promise<GlobalLovedStar[] | null> {
  const response = await apiFetch(`/api/stars/loved-global?limit=${limit}`);
  if (!response?.ok) return null;
  const data = (await response.json()) as { loved?: GlobalLovedStar[] };
  if (!Array.isArray(data.loved)) return [];
  return data.loved.filter(
    (entry) => typeof entry.titleId === "string" && typeof entry.lineIndex === "number",
  );
}

export async function fetchPopularStarsGlobal(
  limit = 100,
): Promise<GlobalPopularStar[] | null> {
  const response = await apiFetch(`/api/stars/popular-global?limit=${limit}`);
  if (!response?.ok) return null;
  const data = (await response.json()) as { popular?: GlobalPopularStar[] };
  if (!Array.isArray(data.popular)) return [];
  return data.popular.filter(
    (entry) =>
      typeof entry.titleId === "string" &&
      typeof entry.lineIndex === "number" &&
      typeof entry.count === "number",
  );
}
