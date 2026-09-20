import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { CatalogEntry } from "../../types/content.js";
import { VIDEO_EXTENSIONS } from "./mediaUploads.js";
import { titlesLikelyMatch } from "./titleMatch.js";

export type ShowVideoHint = {
  name: string;
  season: number;
  episode: number;
  showHint: string | null;
  episodeTitle: string | null;
};

const LEADING_SXXEXX = /^S(\d{1,2})E(\d{1,3})\b(.*)$/i;
const INNER_NXNN = /\b(\d{1,2})x(\d{1,3})\b/i;
const INNER_SXXEXX = /\bS(\d{1,2})E(\d{1,3})\b/i;

/** `S04E01 - The Simpsons - Kamp Krusty (English).Avi` or `Show - 4x01 - Name`. */
export function parseShowVideoFilename(name: string): ShowVideoHint | null {
  const base = name.replace(/\.[^.]+$/, "").replace(/_/g, " ").trim();
  const leading = base.match(LEADING_SXXEXX);
  if (leading) {
    const rest = (leading[3] ?? "").replace(/^[\s._-]+/, "").trim();
    const parts = rest.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
    let showHint: string | null = null;
    let episodeTitle: string | null = null;
    if (parts.length >= 2) {
      showHint = stripEnglishTag(parts[0]!);
      episodeTitle = stripEnglishTag(parts.slice(1).join(" - "));
    } else if (parts.length === 1) {
      episodeTitle = stripEnglishTag(parts[0]!);
    }
    return {
      name,
      season: Number(leading[1]),
      episode: Number(leading[2]),
      showHint,
      episodeTitle,
    };
  }

  const compact = base.match(/^(.+?)\s+-\s+(\d{1,2})x(\d{1,3})(?:\s+-\s+(.+))?$/i);
  if (compact) {
    return {
      name,
      season: Number(compact[2]),
      episode: Number(compact[3]),
      showHint: compact[1]!.trim() || null,
      episodeTitle: compact[4] ? stripEnglishTag(compact[4]) : null,
    };
  }

  const innerS = base.match(INNER_SXXEXX);
  if (innerS) {
    return {
      name,
      season: Number(innerS[1]),
      episode: Number(innerS[2]),
      showHint: null,
      episodeTitle: stripEnglishTag(base),
    };
  }

  const innerN = base.match(INNER_NXNN);
  if (innerN) {
    return {
      name,
      season: Number(innerN[1]),
      episode: Number(innerN[2]),
      showHint: null,
      episodeTitle: stripEnglishTag(base),
    };
  }

  return null;
}

function stripEnglishTag(value: string): string {
  return value
    .replace(/\(\s*english\s*\)/gi, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function listShowVideoNames(directory: string): string[] {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  const names: string[] = [];
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    if (dirent.isFile() && VIDEO_EXTENSIONS.has(extname(dirent.name).toLowerCase())) {
      names.push(dirent.name);
      continue;
    }
    if (!dirent.isDirectory()) continue;
    const nested = join(directory, dirent.name);
    for (const child of readdirSync(nested, { withFileTypes: true })) {
      if (child.isFile() && VIDEO_EXTENSIONS.has(extname(child.name).toLowerCase())) {
        names.push(join(dirent.name, child.name));
      }
    }
  }
  return names.sort((a, b) => a.localeCompare(b));
}

export function matchShowVideoToCatalog(
  hint: ShowVideoHint,
  entries: CatalogEntry[],
  show?: string,
): CatalogEntry | null {
  const pool = entries.filter((entry) => {
    if (entry.meta?.season !== hint.season || entry.meta?.episode !== hint.episode) return false;
    if (!show) return true;
    const catalogShow = entry.meta?.show;
    if (!catalogShow) return false;
    return titlesLikelyMatch({ title: show, year: null }, { title: catalogShow, year: null });
  });
  if (pool.length === 1) return pool[0]!;
  if (pool.length === 0) return null;
  if (hint.episodeTitle && hint.episodeTitle.length >= 6) {
    const named = pool.filter((entry) =>
      titlesLikelyMatch({ title: hint.episodeTitle!, year: null }, { title: entry.title, year: null }),
    );
    if (named.length === 1) return named[0]!;
  }
  return null;
}

export type ShowVideoMatch = {
  titleId: string;
  fileName: string;
  filePath: string;
  season: number;
  episode: number;
};

export function matchShowVideosToCatalog(
  directory: string,
  entries: CatalogEntry[],
  show: string,
): { matched: ShowVideoMatch[]; unmatched: string[] } {
  const names = listShowVideoNames(directory);
  const matched: ShowVideoMatch[] = [];
  const unmatched: string[] = [];
  const used = new Set<string>();

  for (const name of names) {
    const hint = parseShowVideoFilename(name.split(/[/\\]/).pop() ?? name);
    if (!hint) {
      unmatched.push(name);
      continue;
    }
    const entry = matchShowVideoToCatalog(hint, entries, show);
    if (!entry || used.has(entry.id)) {
      unmatched.push(name);
      continue;
    }
    used.add(entry.id);
    matched.push({
      titleId: entry.id,
      fileName: name,
      filePath: join(directory, name),
      season: hint.season,
      episode: hint.episode,
    });
  }

  matched.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return { matched, unmatched };
}
