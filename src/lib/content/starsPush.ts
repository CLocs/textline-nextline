import { existsSync, readFileSync } from "node:fs";
import type { StarSeed } from "./starSeed.js";

export type StarSeedFile = {
  updatedAt?: string;
  stars: StarSeed[];
};

export type ProtectedStarsFile = {
  updatedAt?: string;
  titleIds: string[];
};

const TITLE_ID_RE = /^[a-z0-9-]+$/i;

/** Fallback if content/stars-protected.json is missing. */
export const DEFAULT_PROTECTED_TITLE_IDS = [
  "payback-1999",
  "inglourious-basterds-2009",
  "oceans-thirteen-2007",
  "the-empire-strikes-back-1980",
  "the-wolf-of-wall-street-2013",
  "batman-begins-2005",
  "django-unchained-2012",
];

export function loadProtectedTitleIds(path: string): string[] {
  if (!existsSync(path)) return [...DEFAULT_PROTECTED_TITLE_IDS];
  const raw = JSON.parse(readFileSync(path, "utf8")) as ProtectedStarsFile;
  if (!Array.isArray(raw.titleIds)) {
    throw new Error("stars-protected.json must have a titleIds array.");
  }
  return raw.titleIds.filter((id) => typeof id === "string" && TITLE_ID_RE.test(id.trim()));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadStarSeedFile(path: string): StarSeed[] {
  const raw = JSON.parse(readFileSync(path, "utf8")) as StarSeedFile;
  if (!Array.isArray(raw.stars)) {
    throw new Error("stars-seed.json must have a stars array.");
  }
  return raw.stars.filter((star) => {
    if (!TITLE_ID_RE.test(star.titleId)) return false;
    if (!Number.isInteger(star.lineIndex) || star.lineIndex < 0) return false;
    return true;
  });
}

export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function insertStarsSql(
  stars: Pick<StarSeed, "titleId" | "lineIndex">[],
  playerId: string,
  starredAt: string,
): string {
  if (!UUID_RE.test(playerId)) {
    throw new Error("playerId must be a UUID (logged-in user id).");
  }
  const values = stars
    .map(
      (star) =>
        `(${sqlString(star.titleId)}, ${star.lineIndex}, ${sqlString(playerId)}, ${sqlString(starredAt)})`,
    )
    .join(",\n");
  return `INSERT INTO stars (title_id, line_index, player_id, starred_at)
VALUES
${values}
ON CONFLICT(title_id, line_index, player_id) DO NOTHING;`;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function filterStarsByTitle(
  stars: StarSeed[],
  query: string,
): StarSeed[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return stars;
  return stars.filter((star) => {
    if (star.titleId === needle) return true;
    if (star.titleId.includes(needle)) return true;
    return star.title.toLowerCase().includes(needle);
  });
}

export function excludeTitleIds(
  stars: StarSeed[],
  titleIds: Iterable<string>,
): StarSeed[] {
  const skip = new Set(titleIds);
  return stars.filter((star) => !skip.has(star.titleId));
}

export function countByTitle(stars: Pick<StarSeed, "titleId" | "title">[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const star of stars) {
    const key = star.title || star.titleId;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
