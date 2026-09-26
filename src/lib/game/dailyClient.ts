import { getSessionToken } from "../auth/session.js";
import { getOrCreatePlayerId } from "../stars/playerId.js";
import { todayIso } from "./dailyPick.js";
import { EMPTY_STREAK, nextStreak, preferStreak, type StreakState } from "./dailyStreak.js";

const STORAGE_KEY = "textline-nextline-daily-streak";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
  const base = apiBaseUrl();
  if (!base) return null;
  const headers = new Headers(init.headers);
  headers.set("X-Player-Id", getOrCreatePlayerId());
  const session = getSessionToken();
  if (session) headers.set("Authorization", `Bearer ${session}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  try {
    return await fetch(`${base.replace(/\/$/, "")}${path}`, { ...init, headers });
  } catch {
    return null;
  }
}

function parseStreak(data: unknown): StreakState | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { lastCompletedOn?: unknown; streak?: unknown };
  const streak = typeof row.streak === "number" ? row.streak : 0;
  const lastCompletedOn = typeof row.lastCompletedOn === "string" ? row.lastCompletedOn : null;
  return { lastCompletedOn, streak };
}

export function readLocalStreak(): StreakState {
  if (typeof localStorage === "undefined") return EMPTY_STREAK;
  try {
    const parsed = parseStreak(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null"));
    return parsed ?? EMPTY_STREAK;
  } catch {
    return EMPTY_STREAK;
  }
}

function writeLocalStreak(state: StreakState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export async function loadStreak(): Promise<StreakState> {
  const local = readLocalStreak();
  const response = await apiFetch("/api/daily/streak");
  if (!response?.ok) return local;
  const remote = parseStreak(await response.json());
  if (!remote) return local;
  const best = preferStreak(local, remote);
  writeLocalStreak(best);
  return best;
}

/** Record that today's three questions were finished. Same day does not add a day. */
export async function completeDaily(completedOn = todayIso()): Promise<StreakState> {
  const local = nextStreak(readLocalStreak(), completedOn);
  writeLocalStreak(local);
  const response = await apiFetch("/api/daily/streak", {
    method: "POST",
    body: JSON.stringify({ date: completedOn }),
  });
  if (!response?.ok) return local;
  const remote = parseStreak(await response.json());
  if (!remote) return local;
  const best = preferStreak(local, remote);
  writeLocalStreak(best);
  return best;
}
