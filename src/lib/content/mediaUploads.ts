import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { CatalogEntry } from "../../types/content.js";
import { foldNumberWords, normalizeTitle, parseTitleYear, pickBestTitleMatch } from "./titleMatch.js";

export const VIDEO_EXTENSIONS = new Set([".avi", ".mkv", ".mp4", ".m4v", ".mov", ".wmv"]);

export type MediaFileHint = {
  name: string;
  title: string;
  year: number | null;
  part: number | null;
};

export type UploadStatus = "ok" | "split" | "missing";

export type CatalogUploadRow = {
  titleId: string;
  title: string;
  status: UploadStatus;
  files: string[];
};

export type UnmatchedUpload = {
  name: string;
};

export type UploadsSnapshot = {
  updatedAt: string;
  directory: string;
  matched: CatalogUploadRow[];
  unmatched: UnmatchedUpload[];
};

export type StillsCoverageFile = {
  updatedAt: string;
  titles: Record<string, number>;
};

const SCENE_TAIL =
  /\b(1080p|720p|480p|2160p|4k|uhd|hdr|bluray|blu-ray|webrip|web-dl|web|hdtv|dvdrip|bdrip|xvid|x264|x265|hevc|aac|dts|etrg|remux|proper|repack)\b.*$/i;

/** Filename phrases that should pin a file to one catalog id (Star Wars episodes). */
const MEDIA_ALIASES: { catalogId: string; needles: RegExp[] }[] = [
  {
    catalogId: "star-wars-1977",
    needles: [/\ba new hope\b/i, /\bepisode\s*iv\b/i, /\bepisode\s*4\b/i],
  },
  {
    catalogId: "the-empire-strikes-back-1980",
    needles: [/\bempire strikes back\b/i, /\bepisode\s*v\b/i, /\bepisode\s*5\b/i],
  },
  {
    catalogId: "star-wars-episode-vi-return-of-the-jedi-1983",
    needles: [/\breturn of the jedi\b/i, /\bepisode\s*vi\b/i, /\bepisode\s*6\b/i],
  },
];

export function parseMediaFilename(name: string): MediaFileHint {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ");
  let part: number | null = null;
  let cleaned = base.replace(/\b(?:part|cd|disc)\s*([12])\b/i, (_, n: string) => {
    part = Number(n);
    return " ";
  });
  if (part === null) {
    cleaned = cleaned.replace(/\bp([12])\b/i, (_, n: string) => {
      part = Number(n);
      return " ";
    });
  }

  const parsed = parseTitleYear(cleaned);
  let title = parsed.title.replace(SCENE_TAIL, " ");
  title = title.replace(/\b(1080p|720p|480p|2160p|4k)\b/gi, " ");
  title = title.replace(/[\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  return { name, title, year: parsed.year, part };
}

export function listVideoFilenames(directory: string): string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  return readdirSync(directory)
    .filter((name) => VIDEO_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function movieEntries(entries: CatalogEntry[]): Array<CatalogEntry & { year: number | null }> {
  return entries
    .filter((entry) => !entry.meta?.show && entry.id !== "sample-episode")
    .map((entry) => {
      const parsed = parseTitleYear(entry.title);
      return {
        ...entry,
        title: parsed.title,
        year: entry.meta?.year ?? parsed.year,
      };
    });
}

function aliasCatalogId(title: string): string | null {
  const hay = foldNumberWords(normalizeTitle(title));
  for (const alias of MEDIA_ALIASES) {
    if (alias.needles.some((needle) => needle.test(hay))) return alias.catalogId;
  }
  return null;
}

function episodeToken(title: string): boolean {
  return /\bepisode\b/.test(foldNumberWords(normalizeTitle(title)));
}

export function matchUploadsToCatalog(
  filenames: string[],
  entries: CatalogEntry[],
): { matched: CatalogUploadRow[]; unmatched: UnmatchedUpload[] } {
  const movies = movieEntries(entries);
  const filesByTitle = new Map<string, string[]>();
  const unmatched: UnmatchedUpload[] = [];

  for (const name of filenames) {
    const hint = parseMediaFilename(name);
    const aliasId = aliasCatalogId(hint.title);
    const aliasHit = aliasId ? movies.find((entry) => entry.id === aliasId) : undefined;
    const hit = aliasHit ?? pickBestTitleMatch(hint, movies);
    if (!hit || (!aliasHit && episodeToken(hint.title) && !episodeToken(hit.title))) {
      unmatched.push({ name });
      continue;
    }
    const list = filesByTitle.get(hit.id) ?? [];
    list.push(name);
    filesByTitle.set(hit.id, list);
  }

  const matched: CatalogUploadRow[] = movies
    .map((entry) => {
      const files = filesByTitle.get(entry.id) ?? [];
      let status: UploadStatus = "missing";
      if (files.length === 1) status = "ok";
      else if (files.length > 1) status = "split";
      return { titleId: entry.id, title: entry.title, status, files };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  unmatched.sort((a, b) => a.name.localeCompare(b.name));
  return { matched, unmatched };
}

export function countStillsByTitle(previewRoot: string): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!existsSync(previewRoot) || !statSync(previewRoot).isDirectory()) return counts;
  for (const dirent of readdirSync(previewRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const folder = join(previewRoot, dirent.name);
    let n = 0;
    for (const file of readdirSync(folder)) {
      if (/^\d+\.jpe?g$/i.test(file)) n += 1;
    }
    if (n > 0) counts[dirent.name] = n;
  }
  return counts;
}

export function formatUploadsMarkdown(snapshot: UploadsSnapshot): string {
  const lines = [
    "# Local movie uploads",
    "",
    `Scanned \`${snapshot.directory.replaceAll("\\", "/")}\` against the catalog. Split encodes (Part1/Part2) are listed together. Unmatched files are on disk but not in \`content/titles/\`.`,
    "",
    `Updated: ${snapshot.updatedAt.slice(0, 10)}`,
    "",
    "| Title | Catalog | Files |",
    "|-------|---------|-------|",
  ];

  for (const row of snapshot.matched) {
    const catalog =
      row.status === "ok" ? "[x]" : row.status === "split" ? "[x] split" : "[ ] missing";
    const files = row.files.length ? row.files.map(escapeMd).join("<br>") : "—";
    lines.push(`| ${escapeMd(row.title)} | ${catalog} | ${files} |`);
  }

  lines.push("", "## Unmatched files", "");
  if (snapshot.unmatched.length === 0) {
    lines.push("None.", "");
    return lines.join("\n");
  }

  lines.push("| File |", "|------|");
  for (const row of snapshot.unmatched) {
    lines.push(`| ${escapeMd(row.name)} |`);
  }
  lines.push("");
  return lines.join("\n");
}

function escapeMd(text: string): string {
  return text.replace(/\|/g, "\\|");
}
