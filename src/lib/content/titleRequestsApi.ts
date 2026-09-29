import { getSessionToken } from "../auth/session.js";
import type { RequestableFilm } from "./titleRequests.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function titlesFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = apiBaseUrl();
  if (!base) return null;
  const headers = new Headers(init.headers);
  const session = getSessionToken();
  if (session) headers.set("Authorization", `Bearer ${session}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  try {
    return await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers });
  } catch {
    return null;
  }
}

export async function searchRequestableMovies(
  query: string,
): Promise<RequestableFilm[] | { error: string }> {
  const response = await titlesFetch(`/api/titles/search?q=${encodeURIComponent(query)}`);
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not search movies" };
  }
  const data = (await response.json()) as { films?: RequestableFilm[] };
  if (!Array.isArray(data.films)) return [];
  return data.films.filter(
    (film) =>
      typeof film.tmdbId === "number" &&
      typeof film.title === "string" &&
      typeof film.year === "number",
  );
}

export async function requestMovie(tmdbId: number): Promise<{ created: boolean } | { error: string }> {
  const response = await titlesFetch("/api/titles/request", {
    method: "POST",
    body: JSON.stringify({ tmdbId }),
  });
  if (!response) return { error: "API unavailable" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not request that movie" };
  }
  const data = (await response.json()) as { created?: boolean };
  return { created: data.created === true };
}

export type TitleRequestListItem = RequestableFilm & {
  displayName: string;
  createdAt: string;
};

export async function fetchTitleRequests(): Promise<TitleRequestListItem[]> {
  const response = await titlesFetch("/api/ops/title-requests");
  if (!response?.ok) return [];
  const data = (await response.json()) as { requests?: TitleRequestListItem[] };
  if (!Array.isArray(data.requests)) return [];
  return data.requests.filter(
    (row) => typeof row.title === "string" && typeof row.tmdbId === "number" && typeof row.createdAt === "string",
  );
}
