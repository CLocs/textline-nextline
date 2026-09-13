import type { CatalogEntry, TitleMeta } from "../../types/content.js";

const LANG_TAIL = /\.(en|eng|en-us|eng-sdh|en-sdh|sdh)$/i;
const EPISODE_PATTERN =
  /^(.+?)\s+-\s+(\d{1,2})x(\d{1,3})(?:\s+-\s+(.+))?$/i;

/** Strip trailing language tags like `.en` from titles/filenames. */
export function stripLangSuffix(value: string): string {
  return value.replace(LANG_TAIL, "").trim();
}

/**
 * Parse `Show - 5x01 - Episode` (or `Show - 5x01`) from a title or filename.
 * Also accepts a trailing language tag on the episode name.
 */
export function parseEpisodeMeta(raw: string): TitleMeta | undefined {
  let base = raw.trim();
  base = base.replace(/\.(srt|vtt|sub)$/i, "");
  base = stripLangSuffix(base);

  const match = base.match(EPISODE_PATTERN);
  if (!match) return undefined;

  const show = match[1]?.trim();
  const season = Number(match[2]);
  const episode = Number(match[3]);
  if (!show || !Number.isFinite(season) || !Number.isFinite(episode)) {
    return undefined;
  }

  return { show, season, episode };
}

export function episodeLabel(entry: CatalogEntry): string {
  const meta = entry.meta;
  const cleaned = stripLangSuffix(entry.title);
  if (meta?.season != null && meta.episode != null) {
    const ep = String(meta.episode).padStart(2, "0");
    const code = `${meta.season}x${ep}`;
    const rest = cleaned.match(EPISODE_PATTERN)?.[4]?.trim();
    return rest ? `${code} · ${rest}` : code;
  }
  return cleaned;
}

export function catalogLabel(entry: CatalogEntry): string {
  const show = entry.meta?.show?.trim();
  if (show) return `${show} · ${episodeLabel(entry)}`;
  return stripLangSuffix(entry.title);
}

export type MovieGroup = {
  kind: "movies";
  entries: CatalogEntry[];
};

export type ShowGroup = {
  kind: "show";
  show: string;
  seasons: Map<number, CatalogEntry[]>;
  episodeCount: number;
};

export type LibraryGroups = {
  movies: CatalogEntry[];
  shows: ShowGroup[];
};

export function groupCatalogEntries(entries: CatalogEntry[]): LibraryGroups {
  const movies: CatalogEntry[] = [];
  const byShow = new Map<string, ShowGroup>();

  for (const entry of entries) {
    const show = entry.meta?.show?.trim();
    const season = entry.meta?.season;
    if (!show || season == null) {
      movies.push(entry);
      continue;
    }

    let group = byShow.get(show);
    if (!group) {
      group = { kind: "show", show, seasons: new Map(), episodeCount: 0 };
      byShow.set(show, group);
    }
    const list = group.seasons.get(season) ?? [];
    list.push(entry);
    group.seasons.set(season, list);
    group.episodeCount += 1;
  }

  movies.sort((a, b) => a.title.localeCompare(b.title));

  for (const group of byShow.values()) {
    for (const [, list] of group.seasons) {
      list.sort((a, b) => (a.meta?.episode ?? 0) - (b.meta?.episode ?? 0));
    }
  }

  const shows = [...byShow.values()].sort((a, b) => a.show.localeCompare(b.show));
  return { movies, shows };
}
