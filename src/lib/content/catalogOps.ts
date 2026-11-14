import type { CatalogEntry } from "../../types/content.js";
import { catalogLabel, groupCatalogEntries } from "./libraryGroups.js";
import type { CatalogUploadRow, UploadsSnapshot } from "./mediaUploads.js";

export type CatalogOpsKind = "movie" | "show";

export type CatalogOpsMedia = "ok" | "split" | "missing" | "n/a";

export type CatalogOpsRow = {
  key: string;
  label: string;
  kind: CatalogOpsKind;
  episodeCount?: number;
  curated: boolean;
  lineCount: number;
  starCount: number;
  playCount: number;
  stillCount: number;
  missingCount: number;
  media: CatalogOpsMedia;
  mediaFiles: string[];
};

export function missingStills(starCount: number, stillCount: number): number {
  if (starCount <= 0) return 0;
  return Math.max(0, starCount - stillCount);
}

/** Local preview JPEGs and the last R2 tally. The larger number is what the catalog shows. */
export function displayedStillCount(local: number, remote = 0): number {
  const disk = Number.isFinite(local) && local > 0 ? local : 0;
  const stored = Number.isFinite(remote) && remote > 0 ? remote : 0;
  return Math.max(disk, stored);
}

export function mergeStillCounts(
  local: Record<string, number>,
  remote: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...local };
  for (const [titleId, count] of Object.entries(remote)) {
    merged[titleId] = displayedStillCount(merged[titleId] ?? 0, count);
  }
  return merged;
}

export function formatRemoteStillStatus(
  input: { updatedAt: string | null; refreshing: boolean; listed: number; error: string | null },
  now = Date.now(),
): string {
  if (input.refreshing) {
    return input.listed > 0
      ? `Listing R2… ${input.listed.toLocaleString("en-US")} objects`
      : "Listing R2…";
  }
  if (input.error) return input.error;
  if (!input.updatedAt) return "R2 counts not loaded. Refresh once — the list is saved on this machine.";
  const then = Date.parse(input.updatedAt);
  if (!Number.isFinite(then)) return "R2 counts loaded";
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return "R2 counts just now";
  if (minutes < 60) return `R2 counts ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `R2 counts ${hours}h ago`;
  return `R2 counts ${Math.round(hours / 24)}d ago`;
}

export function coveragePct(have: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((have / total) * 1000) / 10;
}

export function formatCoveragePct(have: number, total: number): string {
  return `${coveragePct(have, total)}%`;
}

export function buildCatalogOpsRows(input: {
  entries: CatalogEntry[];
  protectedIds: Iterable<string>;
  stillCounts: Record<string, number>;
  starCounts: Record<string, number>;
  playCounts: Record<string, number>;
  uploads?: UploadsSnapshot | null;
}): CatalogOpsRow[] {
  const protectedSet = new Set(input.protectedIds);
  const uploadsById = new Map<string, CatalogUploadRow>();
  for (const row of input.uploads?.matched ?? []) {
    uploadsById.set(row.titleId, row);
  }

  const groups = groupCatalogEntries(input.entries);
  const rows: CatalogOpsRow[] = [];

  for (const entry of groups.movies) {
    const upload = uploadsById.get(entry.id);
    rows.push({
      key: entry.id,
      label: catalogLabel(entry),
      kind: "movie",
      curated: protectedSet.has(entry.id),
      lineCount: entry.lineCount,
      starCount: input.starCounts[entry.id] ?? 0,
      playCount: input.playCounts[entry.id] ?? 0,
      stillCount: input.stillCounts[entry.id] ?? 0,
      missingCount: missingStills(input.starCounts[entry.id] ?? 0, input.stillCounts[entry.id] ?? 0),
      media: upload?.status ?? "missing",
      mediaFiles: upload?.files ?? [],
    });
  }

  for (const show of groups.shows) {
    const episodes = [...show.seasons.values()].flat();
    const starCount = episodes.reduce((sum, entry) => sum + (input.starCounts[entry.id] ?? 0), 0);
    const stillCount = episodes.reduce((sum, entry) => sum + (input.stillCounts[entry.id] ?? 0), 0);
    rows.push({
      key: `show:${show.show}`,
      label: show.show,
      kind: "show",
      episodeCount: show.episodeCount,
      curated: episodes.some((entry) => protectedSet.has(entry.id)),
      lineCount: episodes.reduce((sum, entry) => sum + entry.lineCount, 0),
      starCount,
      playCount: episodes.reduce((sum, entry) => sum + (input.playCounts[entry.id] ?? 0), 0),
      stillCount,
      missingCount: missingStills(starCount, stillCount),
      media: "n/a",
      mediaFiles: [],
    });
  }

  return rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "movie" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

export type CatalogOpsSortKey =
  | "label"
  | "kind"
  | "curated"
  | "stars"
  | "plays"
  | "stills"
  | "missing"
  | "stillPct"
  | "media";

export type CatalogOpsSortDir = "asc" | "desc";

const MEDIA_RANK: Record<CatalogOpsMedia, number> = {
  ok: 0,
  split: 1,
  missing: 2,
  "n/a": 3,
};

function compareOps(a: CatalogOpsRow, b: CatalogOpsRow, key: CatalogOpsSortKey): number {
  switch (key) {
    case "label":
      return a.label.localeCompare(b.label);
    case "kind":
      return a.kind.localeCompare(b.kind);
    case "curated":
      return Number(a.curated) - Number(b.curated);
    case "stars":
      return a.starCount - b.starCount;
    case "plays":
      return a.playCount - b.playCount;
    case "stills":
      return a.stillCount - b.stillCount;
    case "missing":
      return a.missingCount - b.missingCount;
    case "stillPct":
      return coveragePct(a.stillCount, a.lineCount) - coveragePct(b.stillCount, b.lineCount);
    case "media":
      return MEDIA_RANK[a.media] - MEDIA_RANK[b.media];
  }
}

/** Default: numbers high-first, labels A–Z. */
export function defaultOpsSortDir(key: CatalogOpsSortKey): CatalogOpsSortDir {
  return key === "label" || key === "kind" || key === "media" ? "asc" : "desc";
}

export function sortCatalogOpsRows(
  rows: CatalogOpsRow[],
  key: CatalogOpsSortKey,
  dir: CatalogOpsSortDir,
): CatalogOpsRow[] {
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = compareOps(a, b, key);
    if (cmp !== 0) return cmp * mul;
    return a.label.localeCompare(b.label);
  });
}
