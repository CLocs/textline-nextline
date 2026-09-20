import type { StudioEpisode, StudioExtractMode, StudioFrame, StudioQueue } from "./stillsStudioTypes.js";

export type { StudioEpisode, StudioExtractMode, StudioFrame, StudioQueue };

const PREFIX = "/api/stills-studio";

export class StudioUnavailableError extends Error {
  constructor() {
    super("Stills studio needs `npm run dev` on this machine.");
    this.name = "StudioUnavailableError";
  }
}

async function studioFetch(path: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${PREFIX}${path}`, init);
  } catch {
    throw new StudioUnavailableError();
  }
  if (response.status === 404 && path === "/health") {
    throw new StudioUnavailableError();
  }
  return response;
}

async function readJson<T>(response: Response): Promise<T> {
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Studio request failed (${response.status})`);
  }
  return data;
}

export async function studioHealth(): Promise<boolean> {
  try {
    const response = await studioFetch("/health");
    return response.ok;
  } catch {
    return false;
  }
}

export async function fetchStudioShows(): Promise<{ show: string; directory: string; directoryExists: boolean }[]> {
  const response = await studioFetch("/shows");
  const data = await readJson<{ shows?: { show: string; directory: string; directoryExists: boolean }[] }>(response);
  return data.shows ?? [];
}

export type StudioQueueResponse = StudioQueue & { starError?: string; remoteStars: boolean };

export async function fetchStudioQueue(show: string): Promise<StudioQueueResponse> {
  const response = await studioFetch(`/queue?show=${encodeURIComponent(show)}`);
  return readJson<StudioQueueResponse>(response);
}

export async function fetchStudioEpisode(titleId: string): Promise<{
  episode: StudioEpisode;
  frames: StudioFrame[];
  show: string;
}> {
  const response = await studioFetch(`/episode?titleId=${encodeURIComponent(titleId)}`);
  return readJson(response);
}

export async function runStudioExtract(opts: {
  titleId: string;
  mode: StudioExtractMode;
  offsetMs?: number;
  timeScale?: number;
  lineOffsets?: Record<string, number>;
}): Promise<{
  episode: StudioEpisode;
  frames: StudioFrame[];
  extracted: number;
  failed: number;
  durationWarn: boolean;
  mode: StudioExtractMode;
}> {
  const response = await studioFetch(opts.mode === "batch" ? "/batch" : "/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return readJson(response);
}

export async function approveStudioEpisode(titleId: string): Promise<{ episode: StudioEpisode }> {
  const response = await studioFetch("/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleId }),
  });
  return readJson(response);
}

export async function pushStudioEpisode(titleId: string): Promise<{ uploaded: number; episode: StudioEpisode }> {
  const response = await studioFetch("/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ titleId }),
  });
  return readJson(response);
}
