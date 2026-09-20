import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CatalogEntry, Title } from "../../types/content.js";
import { loadCatalog, loadTitle, titlePath } from "./load.js";
import {
  loadStillsSyncFile,
  seekModeForTitle,
  type StillsSyncFile,
} from "./extractStills.js";
import { countStillsByTitle } from "./mediaUploads.js";
import { fetchOwnerStarMap, starCountsFromMap, type OwnerStarMap } from "./stillsD1.js";
import { pushPreviewStills } from "./stillsPush.js";
import {
  buildShowQueue,
  durationPastEof,
  extractTitleStills,
  handfulFromStars,
  lastCueStartMsOf,
  listHandfulFrames,
  mergeSyncEntry,
  probeDurationSec,
  remuxIfNeeded,
  STUDIO_SKIP_TITLE_IDS,
  videoDirForShow,
  writeStillsSyncFile,
} from "./stillsStudio.js";
import type { StudioExtractMode, StudioFrame, StudioQueue } from "./stillsStudioTypes.js";

const TITLE_ID_RE = /^[a-z0-9-]+$/i;

export type StudioContext = {
  packageRoot: string;
  syncPath: string;
  previewRoot: string;
};

export function createStudioContext(packageRoot: string): StudioContext {
  return {
    packageRoot,
    syncPath: join(packageRoot, "content", "stills-sync.json"),
    previewRoot: join(packageRoot, "inbox", "stills-preview"),
  };
}

let starCache: { stars: OwnerStarMap; remote: boolean; error?: string; at: number } | null = null;
const STAR_TTL_MS = 5 * 60 * 1000;

function loadStars(ctx: StudioContext, force = false): { stars: OwnerStarMap; remote: boolean; error?: string } {
  if (!force && starCache && Date.now() - starCache.at < STAR_TTL_MS) {
    return starCache;
  }
  const next = { ...fetchOwnerStarMap(ctx.packageRoot), at: Date.now() };
  starCache = next;
  return next;
}

function catalogShows(entries: CatalogEntry[]): string[] {
  const names = new Set<string>();
  for (const entry of entries) {
    const show = entry.meta?.show?.trim();
    if (show) names.add(show);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function titlesNeeded(entries: CatalogEntry[], show: string, sync: StillsSyncFile): Map<string, Title> {
  const map = new Map<string, Title>();
  for (const entry of entries) {
    if (entry.meta?.show !== show) continue;
    if (STUDIO_SKIP_TITLE_IDS.includes(entry.id)) continue;
    if (!sync[entry.id]?.durationSec) continue;
    if (!existsSync(titlePath(entry.id))) continue;
    map.set(entry.id, loadTitle(entry.id));
  }
  return map;
}

export function studioHealth(): { ok: true } {
  return { ok: true };
}

export function listStudioShows(ctx: StudioContext): { shows: { show: string; directory: string; directoryExists: boolean }[] } {
  const catalog = loadCatalog();
  return {
    shows: catalogShows(catalog.titles).map((show) => {
      const directory = videoDirForShow(show);
      return { show, directory, directoryExists: Boolean(directory && existsSync(directory)) };
    }),
  };
}

export function studioQueue(ctx: StudioContext, show: string): StudioQueue & { starError?: string; remoteStars: boolean } {
  const name = show.trim() || "The Simpsons";
  const catalog = loadCatalog();
  const sync = loadStillsSyncFile(ctx.syncPath);
  const { stars, remote, error } = loadStars(ctx);
  const queue = buildShowQueue({
    show: name,
    entries: catalog.titles,
    titlesById: titlesNeeded(catalog.titles, name, sync),
    sync,
    stillCounts: countStillsByTitle(ctx.previewRoot),
    starCounts: starCountsFromMap(stars),
  });
  return { ...queue, remoteStars: remote, starError: error };
}

function requireTitleId(titleId: string): string {
  const id = titleId.trim();
  if (!TITLE_ID_RE.test(id)) {
    throw new Error(`Invalid title id: ${titleId}`);
  }
  if (!existsSync(titlePath(id))) {
    throw new Error(`Title not found: ${id}`);
  }
  return id;
}

function findEpisode(ctx: StudioContext, titleId: string) {
  const title = loadTitle(titleId);
  const catalog = loadCatalog();
  const entry = catalog.titles.find((row) => row.id === titleId);
  const show = entry?.meta?.show?.trim() || "";
  const queue = studioQueue(ctx, show);
  const episode = queue.episodes.find((row) => row.titleId === titleId);
  if (!episode) {
    throw new Error(`Episode is not in the stills queue (skipped or not a show): ${titleId}`);
  }
  return { title, entry, show, episode, queue };
}

export function studioEpisode(
  ctx: StudioContext,
  titleId: string,
): {
  episode: ReturnType<typeof findEpisode>["episode"];
  frames: StudioFrame[];
  show: string;
} {
  const id = requireTitleId(titleId);
  const { title, episode, show } = findEpisode(ctx, id);
  const frames = listHandfulFrames({
    packageRoot: ctx.packageRoot,
    title,
    indices: episode.handful,
    offsetMs: episode.offsetMs,
    timeScale: episode.timeScale,
    lineOffsets: episode.lineOffsets,
    seek: seekModeForTitle(loadStillsSyncFile(ctx.syncPath), id),
  });
  return { episode, frames, show };
}

export type ExtractResponse = {
  episode: ReturnType<typeof findEpisode>["episode"];
  frames: StudioFrame[];
  extracted: number;
  failed: number;
  durationWarn: boolean;
  mode: StudioExtractMode;
};

export function studioExtract(
  ctx: StudioContext,
  opts: {
    titleId: string;
    mode: StudioExtractMode;
    offsetMs?: number;
    timeScale?: number;
    lineOffsets?: Record<string, number>;
  },
): ExtractResponse {
  const id = requireTitleId(opts.titleId);
  const { title, episode, show } = findEpisode(ctx, id);
  if (!episode.videoPath) {
    throw new Error(`No video file for ${episode.label}.`);
  }

  const sync = loadStillsSyncFile(ctx.syncPath);
  const previous = sync[id];
  const offsetMs = Number.isFinite(opts.offsetMs) ? Number(opts.offsetMs) : episode.offsetMs;
  const timeScale =
    opts.timeScale != null && Number.isFinite(opts.timeScale) && opts.timeScale > 0
      ? opts.timeScale
      : episode.timeScale;
  const lineOffsets = opts.lineOffsets ?? episode.lineOffsets;
  const seek = seekModeForTitle(sync, id);
  const accurateSeek = show === "The Simpsons";

  const media = remuxIfNeeded(ctx.packageRoot, id, episode.videoPath);
  const durationSec = probeDurationSec(media);
  const { stars } = loadStars(ctx);
  const starIndices = stars[id] ?? [];

  let indices: number[];
  if (opts.mode === "batch") {
    if (!previous?.approvedAt) {
      throw new Error("Batch only after all six frames are thumbs-up.");
    }
    indices = starIndices;
    if (indices.length === 0) {
      sync[id] = mergeSyncEntry(previous, {
        offsetMs,
        timeScale,
        lineOffsets,
        durationSec: durationSec ?? previous?.durationSec,
        source: episode.videoPath,
        handful: previous?.handful ?? episode.handful,
        batchedAt: new Date().toISOString(),
        note: previous?.note ?? "Studio batch: no D1 stars yet.",
      });
      writeStillsSyncFile(ctx.syncPath, sync);
      const refreshed = findEpisode(ctx, id);
      return {
        episode: refreshed.episode,
        frames: listHandfulFrames({
          packageRoot: ctx.packageRoot,
          title,
          indices: refreshed.episode.handful,
          offsetMs,
          timeScale,
          lineOffsets,
          seek,
        }),
        extracted: 0,
        failed: 0,
        durationWarn: durationPastEof(lastCueStartMsOf(title), durationSec ?? 0, offsetMs, timeScale),
        mode: "batch",
      };
    }
  } else {
    indices =
      opts.mode === "retry" && episode.handful.length > 0
        ? episode.handful
        : handfulFromStars(title, starIndices);
  }

  const results = extractTitleStills({
    packageRoot: ctx.packageRoot,
    title,
    input: media,
    indices,
    offsetMs,
    timeScale,
    seek,
    lineOffsets,
    accurateSeek,
  });

  const now = new Date().toISOString();
  const handful = opts.mode === "batch" ? (previous?.handful ?? episode.handful) : indices;
  const clearingReview = opts.mode !== "batch";
  sync[id] = mergeSyncEntry(previous, {
    offsetMs,
    timeScale,
    lineOffsets,
    durationSec: durationSec ?? previous?.durationSec,
    source: episode.videoPath,
    handful,
    approvedAt: opts.mode === "batch" ? previous?.approvedAt ?? now : undefined,
    batchedAt: opts.mode === "batch" ? now : undefined,
    pushedAt: clearingReview ? undefined : previous?.pushedAt,
    note:
      opts.mode === "batch"
        ? `Studio batch ${results.filter((row) => row.ok).length} stills.`
        : `Studio handful (${handful.join(",")}); inherit offset ${offsetMs}ms.`,
  });
  writeStillsSyncFile(ctx.syncPath, sync);

  const refreshed = findEpisode(ctx, id);
  const frames = listHandfulFrames({
    packageRoot: ctx.packageRoot,
    title,
    indices: refreshed.episode.handful,
    offsetMs,
    timeScale,
    lineOffsets,
    seek,
  });
  return {
    episode: refreshed.episode,
    frames,
    extracted: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    durationWarn: durationPastEof(lastCueStartMsOf(title), durationSec ?? 0, offsetMs, timeScale),
    mode: opts.mode,
  };
}

export function studioApprove(ctx: StudioContext, titleId: string): { episode: ReturnType<typeof findEpisode>["episode"] } {
  const id = requireTitleId(titleId);
  const { episode } = findEpisode(ctx, id);
  if (episode.handful.length === 0) {
    throw new Error("Extract a handful before approving.");
  }
  const sync = loadStillsSyncFile(ctx.syncPath);
  const previous = sync[id];
  if (!previous) {
    throw new Error("No sync entry yet — extract first.");
  }
  sync[id] = mergeSyncEntry(previous, {
    offsetMs: previous.offsetMs,
    approvedAt: new Date().toISOString(),
  });
  writeStillsSyncFile(ctx.syncPath, sync);
  return { episode: findEpisode(ctx, id).episode };
}

export async function studioPush(
  ctx: StudioContext,
  titleId: string,
): Promise<{ uploaded: number; episode: ReturnType<typeof findEpisode>["episode"] }> {
  const id = requireTitleId(titleId);
  const { episode } = findEpisode(ctx, id);
  const sync = loadStillsSyncFile(ctx.syncPath);
  const previous = sync[id];
  if (!previous?.batchedAt) {
    throw new Error("Push only after remaining stars are batched.");
  }
  const { uploaded } = await pushPreviewStills(ctx.packageRoot, id);
  sync[id] = mergeSyncEntry(previous, {
    offsetMs: previous.offsetMs,
    pushedAt: new Date().toISOString(),
  });
  writeStillsSyncFile(ctx.syncPath, sync);
  return { uploaded, episode: findEpisode(ctx, id).episode };
}
