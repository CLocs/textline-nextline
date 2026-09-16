import { getSessionToken } from "../auth/session.js";

export type TitleStat = {
  titleId: string;
  starCount: number;
  playCount: number;
};

function apiBaseUrl(): string | null {
  const url = import.meta.env.VITE_API_URL?.trim();
  return url || null;
}

async function opsFetch(path: string): Promise<Response | null> {
  const base = apiBaseUrl();
  if (!base) return null;

  const headers = new Headers();
  const session = getSessionToken();
  if (session) headers.set("Authorization", `Bearer ${session}`);

  try {
    return await fetch(`${base.replace(/\/$/, "")}${path}`, { headers });
  } catch {
    return null;
  }
}

export async function fetchOpsCatalog(): Promise<TitleStat[]> {
  const response = await opsFetch("/api/ops/catalog");
  if (!response?.ok) return [];
  const data = (await response.json()) as { titles?: TitleStat[] };
  if (!Array.isArray(data.titles)) return [];
  return data.titles.filter(
    (row) =>
      typeof row.titleId === "string" &&
      typeof row.starCount === "number" &&
      typeof row.playCount === "number",
  );
}
