import { getSessionToken } from "../auth/session.js";

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function parallelsFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
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

export type AnalogyPack = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  titleId: string;
  lineIndices: number[];
  shareId: string;
  name: string;
  createdAt: string;
};

export type CatalogConnectionPayload = {
  titleId: string;
  lineIndices: number[];
};

export type RewriteConnectionPayload = {
  context: string;
  text: string;
  sentTo?: {
    people: { userId: string; displayName: string }[];
    groups: { id: string; name: string }[];
  };
};

type ConnectionBase = {
  id: string;
  packId: string;
  note: string | null;
  proposerUserId: string;
  proposerDisplayName: string;
  createdAt: string;
  score: number;
  viewerVoted: boolean;
};

export type AnalogyConnection =
  | (ConnectionBase & { kind: "catalog"; payload: CatalogConnectionPayload })
  | (ConnectionBase & { kind: "rewrite"; payload: RewriteConnectionPayload });

export async function createParallelPack(body: {
  titleId: string;
  lineIndices: number[];
  name: string;
}): Promise<{ pack: AnalogyPack; url: string; playUrl: string } | { error: string }> {
  const response = await parallelsFetch("/api/parallels", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not save pack") };
  return (await response.json()) as { pack: AnalogyPack; url: string; playUrl: string };
}

export async function fetchMyParallelPacks(): Promise<AnalogyPack[] | { error: string }> {
  const response = await parallelsFetch("/api/parallels/mine");
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not load packs") };
  const data = (await response.json()) as { packs?: AnalogyPack[] };
  return Array.isArray(data.packs) ? data.packs : [];
}

export async function fetchParallelPack(
  packId: string,
): Promise<{ pack: AnalogyPack; connections: AnalogyConnection[] } | { error: string }> {
  const response = await parallelsFetch(`/api/parallels/${encodeURIComponent(packId)}`);
  if (!response) return { error: "API unavailable" };
  if (!response.ok) return { error: await readError(response, "Pack not found") };
  return (await response.json()) as { pack: AnalogyPack; connections: AnalogyConnection[] };
}

export async function proposeParallelConnection(
  packId: string,
  body:
    | { kind?: "catalog"; titleId: string; lineIndices: number[]; note?: string }
    | { kind: "rewrite"; context: string; text: string; toUserIds?: string[]; toGroupIds?: string[] },
): Promise<AnalogyConnection | { error: string }> {
  const response = await parallelsFetch(`/api/parallels/${encodeURIComponent(packId)}/connections`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not propose parallel") };
  const data = (await response.json()) as { connection: AnalogyConnection };
  return data.connection;
}

export async function upvoteParallelConnection(
  connectionId: string,
): Promise<{ score: number; viewerVoted: true } | { error: string }> {
  const response = await parallelsFetch(
    `/api/parallels/connections/${encodeURIComponent(connectionId)}/vote`,
    { method: "POST" },
  );
  if (!response) return { error: "API unavailable" };
  if (response.status === 401) return { error: "Please sign in first" };
  if (!response.ok) return { error: await readError(response, "Could not upvote") };
  return (await response.json()) as { score: number; viewerVoted: true };
}
