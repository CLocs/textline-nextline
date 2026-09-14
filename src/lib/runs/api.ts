import { getSessionToken } from "../auth/session.js";

export type RunLength = "full" | "mini";
export type RunMode = "fun" | "teach" | "medium" | "hard";
export type EndReason = "finished" | "miss";
export type Thumb = "up" | "down";

export type SubmitRunBody = {
  id: string;
  titleId: string;
  length: RunLength;
  mode: RunMode;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  questionTotal: number;
  endReason: EndReason;
  shareId?: string | null;
  questionQueue?: number[] | null;
};

export type StoredRun = {
  id: string;
  titleId: string;
  length: RunLength;
  mode: RunMode;
  correctCount: number;
  wrongCount: number;
  skipCount: number;
  questionTotal: number;
  endReason: EndReason;
  shareId: string | null;
  questionQueue: number[] | null;
  completedAt: string;
  thumb: Thumb | null;
};

export type TitlePlayCount = {
  titleId: string;
  playCount: number;
};

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function runsFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
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

export async function submitRun(body: SubmitRunBody): Promise<boolean> {
  const response = await runsFetch("/api/runs", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response?.ok ?? false;
}

export async function fetchMyRuns(): Promise<StoredRun[]> {
  const response = await runsFetch("/api/runs/mine");
  if (!response?.ok) return [];
  const data = (await response.json()) as { runs?: StoredRun[] };
  return Array.isArray(data.runs) ? data.runs : [];
}

export async function rateRun(runId: string, thumb: Thumb): Promise<boolean> {
  const response = await runsFetch(`/api/runs/${encodeURIComponent(runId)}/rating`, {
    method: "PATCH",
    body: JSON.stringify({ thumb }),
  });
  return response?.ok ?? false;
}

export async function shareCompletedRun(
  runId: string,
): Promise<{ shareId: string; url: string } | { error: string }> {
  const response = await runsFetch(`/api/runs/${encodeURIComponent(runId)}/share`, {
    method: "POST",
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return { error: data?.error ?? "Could not create share link" };
  }
  return (await response.json()) as { shareId: string; url: string };
}

export async function fetchPlayedStats(): Promise<TitlePlayCount[]> {
  const response = await runsFetch("/api/stats/played");
  if (!response?.ok) return [];
  const data = (await response.json()) as { titles?: TitlePlayCount[] };
  if (!Array.isArray(data.titles)) return [];
  return data.titles.filter(
    (row) => typeof row.titleId === "string" && typeof row.playCount === "number",
  );
}
