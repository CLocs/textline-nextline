import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import type { CatalogEntry, Title } from "../../types/content.js";
import { loadCatalog, loadTitle, titlePath } from "./load.js";
import type { CueSeek, StillsSyncFile } from "./extractStills.js";
import { loadStillsSyncFile, seekModeForTitle } from "./extractStills.js";
import { countStillsByTitle, upsertStillsCoverageTitle } from "./mediaUploads.js";
import { stillCueIndices } from "./playable.js";
import { fetchOwnerStarMap, starCountsFromMap, type OwnerStarMap } from "./stillsD1.js";
import { listPreviewStillFiles, pushPreviewStills } from "./stillsPush.js";
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
  patchStillsSyncTitle,
  enqueueStudioWrite,
  previewDirForTitle,
  probeDurationSec,
  probeFps,
  resolveStudioInput,
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
import type {
  StudioExtractMode,
  StudioExtractProgress,
  StudioFrame,
  StudioPushJob,
  StudioQueue,
} from "./stillsStudioTypes.js";

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
let pushJob: StudioPushJob | null = null;
const extractProgressByTitle = new Map<string, StudioExtractProgress>();

export function studioExtractProgress(titleId = ""): StudioExtractProgress | null {
  if (!titleId) return null;
  const row = extractProgressByTitle.get(titleId);
  return row ? { ...row } : null;
}

export function clearStudioExtractProgress(titleId?: string): void {
  if (titleId) extractProgressByTitle.delete(titleId);
  else extractProgressByTitle.clear();
}
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
  return [...names].sort((a, b) => {
    if (a === MOVIES_STUDIO_SHOW) return -1;
    if (b === MOVIES_STUDIO_SHOW) return 1;
    return a.localeCompare(b);
  });
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

export function studioCoverage(ctx: StudioContext): { titles: Record<string, number> } {
  return { titles: countStillsByTitle(ctx.previewRoot) };
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
  const name = show.trim() || MOVIES_STUDIO_SHOW;
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
  let indices =
    showAll && fromDisk.length > 0
      ? fromDisk
      : episode.handful.length > 0
        ? episode.handful
        : fromDisk;
  // A full-line batch is hundreds of JPEGs. Keep the six review frames on the page.
  const reviewCap = Math.max(episode.starCount + episode.handful.length, 48);
  if (indices.length > reviewCap) {
    indices = episode.handful.length > 0 ? episode.handful : indices.slice(0, 48);
  }
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

function upsertCoverageForTitle(ctx: StudioContext, titleId: string): void {
  upsertStillsCoverageTitle(
    join(ctx.packageRoot, "content", "stills-coverage.json"),
    titleId,
    join(ctx.previewRoot, titleId),
  );
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
  skipped: number;
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

export async function studioExtract(
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
): Promise<ExtractResponse> {
  const id = requireTitleId(opts.titleId);
  const { title, episode, show } = findEpisode(ctx, id);
  if (pushJob?.status === "running" && pushJob.titleId === id) {
    throw new Error(`Still pushing ${pushJob.label} to R2. Switch titles or wait for the upload.`);
  }
  const sources = episode.sourcePaths?.length
    ? episode.sourcePaths
    : episode.videoPath
      ? [episode.videoPath]
      : [];
  if (sources.length === 0) {
    throw new Error(`No video file for ${episode.label}.`);
  }

  const sync = loadStillsSyncFile(ctx.syncPath);
  const previous = sync[id];
  const accurateSeek = show === "The Simpsons";
  const media = resolveStudioInput(ctx.packageRoot, id, sources);
  const durationSec = probeDurationSec(media);
  const fps = previous?.fps ?? probeFps(media) ?? episode.fps;
  const needsStars = opts.mode === "batch" || opts.mode === "handful" || opts.mode === "shuffle";
  const { stars } = loadStars(ctx, needsStars);
  const starIndices = stars[id] ?? [];
  const fillingLines = opts.mode === "lines" || opts.mode === "batch";

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
  if (fillingLines) {
    if (!previous?.approvedAt) {
      throw new Error("Batch only after the review frames are approved.");
    }
    indices = opts.mode === "lines" ? stillCueIndices(title) : starIndices;
    if (indices.length === 0) {
      await enqueueStudioWrite(() => {
        const latest = loadStillsSyncFile(ctx.syncPath);
        latest[id] = mergeSyncEntry(latest[id] ?? previous, {
          offsetMs,
          timeScale,
          seek,
          fps: fps ?? undefined,
          lineOffsets,
          durationSec: durationSec ?? previous?.durationSec,
          source: media,
          handful: previous?.handful ?? episode.handful,
          batchedAt: new Date().toISOString(),
          note:
            latest[id]?.note ??
            previous?.note ??
            (opts.mode === "lines" ? "Studio lines: no playable cues." : "Studio batch: no D1 stars yet."),
          methodId: previous?.methodId ?? method.id,
          triedMethods: previous?.triedMethods,
        });
        writeStillsSyncFile(ctx.syncPath, latest);
        upsertCoverageForTitle(ctx, id);
      });
      const refreshed = findEpisode(ctx, id);
      return {
        episode: refreshed.episode,
        frames: framesForEpisode(ctx, title, refreshed.episode),
        extracted: 0,
        failed: 0,
        skipped: 0,
        durationWarn: durationPastEof(lastCueStartMsOf(title), durationSec ?? 0, offsetMs, timeScale),
        mode: opts.mode,
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

  const results = await extractTitleStills({
    packageRoot: ctx.packageRoot,
    title,
    input: media,
    indices,
    offsetMs,
    timeScale,
    seek,
    lineOffsets,
    accurateSeek,
    skipExisting: opts.mode === "lines",
    onProgress: fillingLines
      ? (done, total) => {
          extractProgressByTitle.set(id, { titleId: id, done, total });
        }
      : undefined,
  });

  const now = new Date().toISOString();
  const wrote = results.filter((row) => row.ok && !row.skipped).length;
  const skipped = results.filter((row) => row.skipped).length;
  const handful = fillingLines ? (previous?.handful ?? episode.handful) : indices;
  const triedMethods =
    fillingLines || opts.mode === "shuffle"
      ? previous?.triedMethods
      : recordTriedMethodIds(previous?.triedMethods, episode.methodId, method.id);
  await enqueueStudioWrite(() => {
    const latest = loadStillsSyncFile(ctx.syncPath);
    const base = latest[id] ?? previous;
    latest[id] = mergeSyncEntry(base, {
      offsetMs,
      timeScale,
      seek,
      fps: fps ?? undefined,
      lineOffsets,
      durationSec: durationSec ?? base?.durationSec,
      source: media,
      handful,
      approvedAt: fillingLines ? (base?.approvedAt ?? previous?.approvedAt ?? now) : undefined,
      // Handful/smart/retry after a batch must drop these so the six-frame review returns.
      // Batch after a later star change must un-push so the new JPEGs can go to R2.
      batchedAt: fillingLines ? now : undefined,
      pushedAt: undefined,
      methodId: fillingLines || opts.mode === "shuffle" ? (base?.methodId ?? method.id) : method.id,
      triedMethods,
      note:
        opts.mode === "lines"
          ? `Studio lines ${wrote} stills${skipped > 0 ? ` (${skipped} already on disk)` : ""}.`
          : opts.mode === "batch"
            ? `Studio batch ${wrote} stills.`
            : opts.mode === "shuffle"
              ? `Studio shuffle (${handful.join(",")}).`
              : `Studio ${opts.mode} ${method.label} (${handful.join(",")}).`,
    });
    writeStillsSyncFile(ctx.syncPath, latest);
    if (fillingLines) upsertCoverageForTitle(ctx, id);
  });

  const refreshed = findEpisode(ctx, id);
  return {
    episode: refreshed.episode,
    frames: framesForEpisode(ctx, title, refreshed.episode),
    extracted: wrote,
    failed: results.filter((row) => !row.ok).length,
    skipped,
    durationWarn: durationPastEof(lastCueStartMsOf(title), durationSec ?? 0, offsetMs, timeScale),
    mode: opts.mode,
    previewDir: previewDirForTitle(id),
    method,
  };
}

export async function studioApprove(ctx: StudioContext, titleId: string): Promise<{ episode: ReturnType<typeof findEpisode>["episode"] }> {
  const id = requireTitleId(titleId);
  const { episode } = findEpisode(ctx, id);
  if (episode.handful.length === 0) {
    throw new Error("Extract a handful before approving.");
  }
  await patchStillsSyncTitle(ctx.syncPath, id, (previous) => {
    if (!previous) {
      throw new Error("No sync entry yet — extract first.");
    }
    return mergeSyncEntry(previous, {
      offsetMs: previous.offsetMs,
      approvedAt: new Date().toISOString(),
    });
  });
  return { episode: findEpisode(ctx, id).episode };
}

export function studioPushStatus(): StudioPushJob | null {
  return pushJob ? { ...pushJob } : null;
}

export function startStudioPush(ctx: StudioContext, titleId: string): StudioPushJob {
  const id = requireTitleId(titleId);
  if (pushJob?.status === "running") {
    if (pushJob.titleId === id) return { ...pushJob };
    throw new Error(`Already pushing ${pushJob.label} to R2. That keeps going if you switch titles.`);
  }
  const { episode } = findEpisode(ctx, id);
  const sync = loadStillsSyncFile(ctx.syncPath);
  const previous = sync[id];
  if (!previous?.batchedAt) {
    throw new Error("Push only after remaining stars are batched.");
  }
  const files = listPreviewStillFiles(ctx.previewRoot, id);
  if (files.length === 0) {
    throw new Error(`No preview JPEGs for ${episode.label}.`);
  }
  pushJob = {
    titleId: id,
    label: episode.label,
    total: files.length,
    done: 0,
    status: "running",
  };
  void runStudioPush(ctx, id, previous.offsetMs).catch((error: unknown) => {
    if (pushJob?.titleId !== id) return;
    pushJob = {
      ...pushJob,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  });
  return { ...pushJob };
}

async function runStudioPush(ctx: StudioContext, id: string, offsetMs: number): Promise<void> {
  const { uploaded } = await pushPreviewStills(ctx.packageRoot, id, {
    onProgress(done, total) {
      if (pushJob?.titleId !== id || pushJob.status !== "running") return;
      pushJob = { ...pushJob, done, total };
    },
  });
  await enqueueStudioWrite(() => {
    const sync = loadStillsSyncFile(ctx.syncPath);
    const previous = sync[id];
    if (!previous) return;
    sync[id] = mergeSyncEntry(previous, {
      offsetMs: previous.offsetMs ?? offsetMs,
      pushedAt: new Date().toISOString(),
    });
    writeStillsSyncFile(ctx.syncPath, sync);
  });
  if (pushJob?.titleId !== id) return;
  pushJob = {
    ...pushJob,
    status: "ok",
    done: uploaded,
    total: Math.max(pushJob.total, uploaded),
    uploaded,
    previewDir: previewDirForTitle(id),
  };
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
