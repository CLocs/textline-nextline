import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { CatalogEntry, Title } from "../../types/content.js";
import { loadCatalog, loadTitle, titlePath } from "./load.js";
import type { CueSeek } from "./extractStills.js";
import { loadStillsSyncFile, seekModeForTitle } from "./extractStills.js";
import { countStillsByTitle } from "./mediaUploads.js";
import { fetchOwnerStarMap, starCountsFromMap, type OwnerStarMap } from "./stillsD1.js";
import { pushPreviewStills } from "./stillsPush.js";
import {
  buildShowQueue,
  durationPastEof,
  extractTitleStills,
  handfulFromStars,
  shuffleHandfulFromStars,
  lastCueStartMsOf,
  listHandfulFrames,
  listPreviewStillIndices,
  mergeSyncEntry,
  previewDirForTitle,
  probeDurationSec,
  probeFps,
  remuxIfNeeded,
  STUDIO_SKIP_TITLE_IDS,
  videoDirForShow,
  writeStillsSyncFile,
  MOVIES_STUDIO_SHOW,
  isMoviesStudioShow,
} from "./stillsStudio.js";
import {
  describeStudioMethod,
  pickNextStudioMethod,
  recordTriedMethodIds,
  type StudioVote,
} from "./stillsStudioMethods.js";
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
  if (entries.some((entry) => !entry.meta?.show && entry.id !== "sample-episode")) {
    names.add(MOVIES_STUDIO_SHOW);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function titlesNeeded(entries: CatalogEntry[], show: string, sync: StillsSyncFile): Map<string, Title> {
  const map = new Map<string, Title>();
  const movies = isMoviesStudioShow(show);
  for (const entry of entries) {
    if (movies) {
      if (entry.meta?.show || entry.id === "sample-episode") continue;
    } else if (entry.meta?.show !== show) {
      continue;
    }
    if (STUDIO_SKIP_TITLE_IDS.includes(entry.id)) continue;
    if (!movies && !sync[entry.id]?.durationSec) continue;
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
  const show = entry?.meta?.show?.trim() || MOVIES_STUDIO_SHOW;
  const queue = studioQueue(ctx, show);
  const episode = queue.episodes.find((row) => row.titleId === titleId);
  if (!episode) {
    throw new Error(`Episode is not in the stills queue (skipped or not a show): ${titleId}`);
  }
  return { title, entry, show, episode, queue };
}

function framesForEpisode(
  ctx: StudioContext,
  title: ReturnType<typeof loadTitle>,
  episode: ReturnType<typeof findEpisode>["episode"],
): StudioFrame[] {
  const sync = loadStillsSyncFile(ctx.syncPath);
  const destDir = join(ctx.previewRoot, title.id);
  const showAll = episode.status === "batched" || episode.status === "pushed";
  const fromDisk = listPreviewStillIndices(destDir);
  const indices =
    showAll && fromDisk.length > 0
      ? fromDisk
      : episode.handful.length > 0
        ? episode.handful
        : fromDisk;
  return listHandfulFrames({
    packageRoot: ctx.packageRoot,
    title,
    indices,
    offsetMs: episode.offsetMs,
    timeScale: episode.timeScale,
    lineOffsets: episode.lineOffsets,
    seek: seekModeForTitle(sync, title.id),
  });
}

function openLocalFolder(folder: string): void {
  if (process.platform === "win32") {
    spawn("explorer", [folder], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [folder], { detached: true, stdio: "ignore" }).unref();
}

export function studioEpisode(
  ctx: StudioContext,
  titleId: string,
): {
  episode: ReturnType<typeof findEpisode>["episode"];
  frames: StudioFrame[];
  show: string;
  previewDir: string;
} {
  const id = requireTitleId(titleId);
  const { title, episode, show } = findEpisode(ctx, id);
  return { episode, frames: framesForEpisode(ctx, title, episode), show, previewDir: previewDirForTitle(id) };
}

export type ExtractResponse = {
  episode: ReturnType<typeof findEpisode>["episode"];
  frames: StudioFrame[];
  extracted: number;
  failed: number;
  durationWarn: boolean;
  mode: StudioExtractMode;
  previewDir: string;
  method: { id: string; label: string; why: string };
};

function parseSeek(raw: unknown, fallback: CueSeek): CueSeek {
  return raw === "mid" || raw === "start" ? raw : fallback;
}

export function parseStudioVotes(raw: unknown): Record<string, StudioVote> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const votes: Record<string, StudioVote> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === "up" || value === "down") votes[key] = value;
  }
  return Object.keys(votes).length > 0 ? votes : undefined;
}

export function studioExtract(
  ctx: StudioContext,
  opts: {
    titleId: string;
    mode: StudioExtractMode;
    offsetMs?: number;
    timeScale?: number;
    lineOffsets?: Record<string, number>;
    seek?: CueSeek;
    votes?: Record<string, StudioVote>;
  },
): ExtractResponse {
  const id = requireTitleId(opts.titleId);
  const { title, episode, show } = findEpisode(ctx, id);
  if (!episode.videoPath) {
    throw new Error(`No video file for ${episode.label}.`);
  }

  const sync = loadStillsSyncFile(ctx.syncPath);
  const previous = sync[id];
  const accurateSeek = show === "The Simpsons";
  const media = remuxIfNeeded(ctx.packageRoot, id, episode.videoPath);
  const durationSec = probeDurationSec(media);
  const fps = previous?.fps ?? probeFps(media) ?? episode.fps;
  const { stars } = loadStars(ctx);
  const starIndices = stars[id] ?? [];

  let offsetMs = Number.isFinite(opts.offsetMs) ? Number(opts.offsetMs) : episode.offsetMs;
  let timeScale =
    opts.timeScale != null && Number.isFinite(opts.timeScale) && opts.timeScale > 0
      ? Number(opts.timeScale)
      : episode.timeScale;
  let seek = parseSeek(opts.seek, episode.seek);
  let lineOffsets = opts.lineOffsets ?? episode.lineOffsets;
  let method = describeStudioMethod(show, { offsetMs, timeScale, seek });

  if (opts.mode === "smart") {
    const next = pickNextStudioMethod({
      show,
      fps,
      current: { offsetMs: episode.offsetMs, timeScale: episode.timeScale, seek: episode.seek },
      triedIds: episode.triedMethodIds ?? [],
      votes: opts.votes,
      frameOrder: episode.handful.length > 0 ? episode.handful : starIndices,
    });
    if (!next) {
      throw new Error("Tried every recipe. Use the knobs or per-line ±1s.");
    }
    offsetMs = next.offsetMs;
    timeScale = next.timeScale;
    seek = next.seek;
    lineOffsets = {};
    method = next;
  }

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
        seek,
        fps: fps ?? undefined,
        lineOffsets,
        durationSec: durationSec ?? previous?.durationSec,
        source: episode.videoPath,
        handful: previous?.handful ?? episode.handful,
        batchedAt: new Date().toISOString(),
        note: previous?.note ?? "Studio batch: no D1 stars yet.",
        methodId: previous?.methodId ?? method.id,
        triedMethods: previous?.triedMethods,
      });
      writeStillsSyncFile(ctx.syncPath, sync);
      const refreshed = findEpisode(ctx, id);
      return {
        episode: refreshed.episode,
        frames: framesForEpisode(ctx, title, refreshed.episode),
        extracted: 0,
        failed: 0,
        durationWarn: durationPastEof(lastCueStartMsOf(title), durationSec ?? 0, offsetMs, timeScale),
        mode: "batch",
        previewDir: previewDirForTitle(id),
        method,
      };
    }
  } else if (opts.mode === "shuffle") {
    indices = shuffleHandfulFromStars(title, starIndices, episode.handful);
    if (indices.length === 0) {
      throw new Error("Could not pick another handful of frames.");
    }
  } else {
    indices =
      (opts.mode === "retry" || opts.mode === "smart") && episode.handful.length > 0
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
  const triedMethods =
    opts.mode === "batch" || opts.mode === "shuffle"
      ? previous?.triedMethods
      : recordTriedMethodIds(previous?.triedMethods, episode.methodId, method.id);
  sync[id] = mergeSyncEntry(previous, {
    offsetMs,
    timeScale,
    seek,
    fps: fps ?? undefined,
    lineOffsets,
    durationSec: durationSec ?? previous?.durationSec,
    source: episode.videoPath,
    handful,
    approvedAt: opts.mode === "batch" ? previous?.approvedAt ?? now : undefined,
    batchedAt: opts.mode === "batch" ? now : undefined,
    pushedAt: clearingReview ? undefined : previous?.pushedAt,
    methodId: opts.mode === "batch" || opts.mode === "shuffle" ? previous?.methodId ?? method.id : method.id,
    triedMethods,
    note:
      opts.mode === "batch"
        ? `Studio batch ${results.filter((row) => row.ok).length} stills.`
        : opts.mode === "shuffle"
          ? `Studio shuffle (${handful.join(",")}).`
          : `Studio ${opts.mode} ${method.label} (${handful.join(",")}).`,
  });
  writeStillsSyncFile(ctx.syncPath, sync);

  const refreshed = findEpisode(ctx, id);
  return {
    episode: refreshed.episode,
    frames: framesForEpisode(ctx, title, refreshed.episode),
    extracted: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    durationWarn: durationPastEof(lastCueStartMsOf(title), durationSec ?? 0, offsetMs, timeScale),
    mode: opts.mode,
    previewDir: previewDirForTitle(id),
    method,
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
): Promise<{ uploaded: number; episode: ReturnType<typeof findEpisode>["episode"]; previewDir: string }> {
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
  return { uploaded, episode: findEpisode(ctx, id).episode, previewDir: previewDirForTitle(id) };
}

export function studioOpenPreview(ctx: StudioContext, titleId: string): { ok: true; folder: string } {
  const id = requireTitleId(titleId);
  const folder = join(ctx.previewRoot, id);
  if (!existsSync(folder)) {
    throw new Error(`No stills folder yet: ${previewDirForTitle(id)}`);
  }
  openLocalFolder(folder);
  return { ok: true, folder };
}
