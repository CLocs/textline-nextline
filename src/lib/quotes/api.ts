import { getSessionToken } from "../auth/session.js";
import { getOrCreatePlayerId } from "../stars/playerId.js";

export type MyQuote = {
  titleId: string;
  lineIndex: number;
  quotedAt: string;
};

export type PopularQuote = {
  titleId: string;
  lineIndex: number;
  count: number;
};

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

export function isQuoteApiEnabled(): boolean {
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

export async function quoteLine(titleId: string, lineIndex: number): Promise<boolean> {
  const response = await apiFetch("/api/quotes", {
    method: "PUT",
    body: JSON.stringify({ titleId, lineIndex }),
  });
  return response?.ok ?? false;
}

export async function unquoteLine(titleId: string, lineIndex: number): Promise<boolean> {
  const response = await apiFetch("/api/quotes", {
    method: "DELETE",
    body: JSON.stringify({ titleId, lineIndex }),
  });
  return response?.ok ?? false;
}

export async function fetchMyQuotes(titleId?: string): Promise<MyQuote[] | null> {
  const path = titleId
    ? `/api/quotes/mine?titleId=${encodeURIComponent(titleId)}`
    : "/api/quotes/mine";
  const response = await apiFetch(path);
  if (!response?.ok) return null;
  const data = (await response.json()) as { quotes?: MyQuote[] };
  if (!Array.isArray(data.quotes)) return null;
  return data.quotes.filter(
    (quote) =>
      typeof quote.titleId === "string" &&
      Number.isInteger(quote.lineIndex) &&
      quote.lineIndex >= 0,
  );
}

export async function fetchPopularQuotesGlobal(limit = 100): Promise<PopularQuote[] | null> {
  const response = await apiFetch(`/api/quotes/popular-global?limit=${limit}`);
  if (!response?.ok) return null;
  const data = (await response.json()) as { quotes?: PopularQuote[] };
  if (!Array.isArray(data.quotes)) return null;
  return data.quotes;
}
