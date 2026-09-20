import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import type { CatalogEntry, Line, Title } from "../../types/content.js";
import { episodeLabel } from "./libraryGroups.js";
import type { CueSeek, StillsSyncEntry, StillsSyncFile } from "./extractStills.js";
import {
  cueAnchorMs,
  defaultOffsetMsForShow,
  ffmpegExtractArgs,
  ffmpegRemuxArgs,
  mediaRemuxOutput,
  resolveCue,
  seekModeForTitle,
  seekSeconds,
  stillFileName,
  timeScaleForTitle,
} from "./extractStills.js";
import { matchShowVideosToCatalog } from "./showMedia.js";
import { pickHandfulIndices as pickHandful } from "./stillsHandful.js";
import { describeStudioMethod } from "./stillsStudioMethods.js";
import type { StudioEpisode, StudioEpisodeStatus, StudioFrame, StudioQueue } from "./stillsStudioTypes.js";

export type { StudioEpisode, StudioEpisodeStatus, StudioFrame, StudioQueue } from "./stillsStudioTypes.js";

export const STUDIO_SKIP_TITLE_IDS = [
  "the-simpsons---4x01---kamp-krustyen",
  "the-simpsons---4x02---a-streetcar-named-margeen",
];

export const SHOW_VIDEO_DIRS: Record<string, string> = {
  "The Simpsons": "G:/videos/shows/Simpsons",
};

export function videoDirForShow(show: string): string {
  if (SHOW_VIDEO_DIRS[show]) return SHOW_VIDEO_DIRS[show]!;
  const lower = show.trim().toLowerCase();
  for (const [name, dir] of Object.entries(SHOW_VIDEO_DIRS)) {
    if (name.toLowerCase() === lower) return dir;
  }
  return "";
}

/** True when the last SRT cue seeks past the remux duration (Streetcar-style EOF). */
export function durationPastEof(
  lastCueStartMs: number,
  durationSec: number,
  offsetMs: number,
  timeScale = 1,
): boolean {
  if (lastCueStartMs <= 0 || durationSec <= 0) return false;
  return durationSec + 2 < seekSeconds(lastCueStartMs, offsetMs, timeScale);
}

function lastCueStartMs(title: Title): number {
  let max = 0;
  for (const line of title.lines) {
    if (line.startMs > max) max = line.startMs;
  }
  return max;
}

export function episodeStatus(opts: {
  hasFile: boolean;
  stillCount: number;
  handful: number[];
  approvedAt?: string;
  batchedAt?: string;
  pushedAt?: string;
}): StudioEpisodeStatus {
  if (opts.pushedAt) return "pushed";
  if (opts.batchedAt) return "batched";
  if (opts.approvedAt) return "approved";
  if (!opts.hasFile) return "no-file";
  if (opts.handful.length > 0 && opts.stillCount > 0) return "review";
  return "ready";
}

export function buildShowQueue(opts: {
  show: string;
  entries: CatalogEntry[];
  titlesById: Map<string, Title>;
  sync: StillsSyncFile;
  stillCounts: Record<string, number>;
  starCounts: Record<string, number>;
  directory?: string;
  skipIds?: Iterable<string>;
}): StudioQueue {
  const directory = opts.directory ?? videoDirForShow(opts.show);
  const skip = new Set(opts.skipIds ?? STUDIO_SKIP_TITLE_IDS);
  const directoryExists = Boolean(directory && existsSync(directory));
  const { matched, unmatched } = directoryExists
    ? matchShowVideosToCatalog(directory, opts.entries, opts.show)
    : { matched: [], unmatched: [] };
  const byId = new Map(matched.map((row) => [row.titleId, row]));

  const episodes: StudioEpisode[] = [];
  for (const entry of opts.entries) {
    if (entry.meta?.show !== opts.show) continue;
    if (entry.meta.season == null || entry.meta.episode == null) continue;
    if (skip.has(entry.id)) continue;
    const title = opts.titlesById.get(entry.id);
    const syncEntry = opts.sync[entry.id];
    const video = byId.get(entry.id);
    const offsetMs =
      syncEntry && Number.isFinite(syncEntry.offsetMs)
        ? syncEntry.offsetMs
        : defaultOffsetMsForShow(opts.show);
    const stillCount = opts.stillCounts[entry.id] ?? 0;
    const starCount = opts.starCounts[entry.id] ?? 0;
    const handful = syncEntry?.handful ?? [];
    const durationSec = syncEntry?.durationSec ?? null;
    const lastCueMs = title ? lastCueStartMs(title) : 0;
    const timeScale = timeScaleForTitle(opts.sync, entry.id);
    const seek = seekModeForTitle(opts.sync, entry.id);
    const method = describeStudioMethod(opts.show, { offsetMs, timeScale, seek });
    episodes.push({
      titleId: entry.id,
      title: entry.title,
      label: episodeLabel(entry),
      season: entry.meta.season,
      episode: entry.meta.episode,
      lineCount: entry.lineCount,
      status: episodeStatus({
        hasFile: Boolean(video),
        stillCount,
        handful,
        approvedAt: syncEntry?.approvedAt,
        batchedAt: syncEntry?.batchedAt,
        pushedAt: syncEntry?.pushedAt,
      }),
      videoPath: video?.filePath ?? null,
      videoName: video?.fileName ?? null,
      offsetMs,
      timeScale,
      lineOffsets: syncEntry?.lineOffsets ?? {},
      handful,
      starCount,
      stillCount,
      durationSec,
      durationWarn:
        durationSec != null && durationPastEof(lastCueMs, durationSec, offsetMs, timeScale),
      fps: syncEntry?.fps ?? null,
      seek,
      methodId: syncEntry?.methodId ?? method.id,
      methodLabel: method.label,
      triedMethodIds: syncEntry?.triedMethods ?? [],
    });
  }

  episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
  return { show: opts.show, directory, directoryExists, episodes, unmatched };
}

export function remuxIfNeeded(packageRoot: string, titleId: string, sourcePath: string): string {
  const output = mediaRemuxOutput(packageRoot, titleId);
  if (existsSync(output)) return output;
  mkdirSync(dirname(output), { recursive: true });
  execFileSync("ffmpeg", ffmpegRemuxArgs({ input: sourcePath, output }), { stdio: "pipe" });
  if (!existsSync(output)) {
    throw new Error(`Remux failed: ${output}`);
  }
  return output;
}

export function probeDurationSec(input: string): number | null {
  try {
    const raw = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", input],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function parseFrameRate(raw: string): number | null {
  const token = raw.trim().split(/\s+/)[0] ?? "";
  if (!token) return null;
  if (token.includes("/")) {
    const [num, den] = token.split("/");
    const n = Number(num) / Number(den);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const n = Number(token);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function probeFps(input: string): number | null {
  try {
    const raw = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=r_frame_rate",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        input,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return parseFrameRate(raw);
  } catch {
    return null;
  }
}

export type ExtractResult = {
  lineIndex: number;
  text: string;
  seekSec: number;
  ok: boolean;
  error?: string;
};

export function extractTitleStills(opts: {
  packageRoot: string;
  title: Title;
  input: string;
  indices: number[];
  offsetMs: number;
  timeScale: number;
  seek?: CueSeek;
  lineOffsets?: Record<string, number>;
  accurateSeek?: boolean;
}): ExtractResult[] {
  const destDir = join(opts.packageRoot, "inbox", "stills-preview", opts.title.id);
  mkdirSync(destDir, { recursive: true });
  const results: ExtractResult[] = [];
  for (const lineIndex of opts.indices) {
    let cue: Line;
    try {
      cue = resolveCue(opts.title, lineIndex);
    } catch (error) {
      results.push({
        lineIndex,
        text: "",
        seekSec: 0,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    const extra = opts.lineOffsets?.[String(lineIndex)] ?? 0;
    const seekSec = seekSeconds(
      cueAnchorMs(cue, opts.seek ?? "start"),
      opts.offsetMs,
      opts.timeScale,
      extra,
    );
    const output = join(destDir, stillFileName(lineIndex));
    try {
      execFileSync(
        "ffmpeg",
        ffmpegExtractArgs({
          input: opts.input,
          seekSec,
          output,
          accurateSeek: opts.accurateSeek,
        }),
        { stdio: "pipe" },
      );
      results.push({
        lineIndex,
        text: cue.text,
        seekSec,
        ok: existsSync(output),
        error: existsSync(output) ? undefined : "No still written (seek past end of file?)",
      });
    } catch {
      results.push({
        lineIndex,
        text: cue.text,
        seekSec,
        ok: false,
        error: "ffmpeg failed",
      });
    }
  }
  return results;
}

export function mergeSyncEntry(
  previous: StillsSyncEntry | undefined,
  patch: Partial<StillsSyncEntry> & { offsetMs: number },
): StillsSyncEntry {
  return {
    ...previous,
    ...patch,
    offsetMs: patch.offsetMs,
    lineOffsets: patch.lineOffsets ?? previous?.lineOffsets,
    handful: patch.handful ?? previous?.handful,
  };
}

export function writeStillsSyncFile(path: string, sync: StillsSyncFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(sync, null, 2)}\n`, "utf8");
}

export function handfulFromStars(title: Title, starIndices: number[]): number[] {
  return pickHandful(title, starIndices);
}

export function lastCueStartMsOf(title: Title): number {
  return lastCueStartMs(title);
}

const STILL_JPEG = /^(\d+)\.jpe?g$/i;

export function previewDirForTitle(titleId: string): string {
  return `inbox/stills-preview/${titleId}`;
}

export function listPreviewStillIndices(destDir: string): number[] {
  if (!existsSync(destDir)) return [];
  const indices: number[] = [];
  for (const name of readdirSync(destDir)) {
    const match = STILL_JPEG.exec(name);
    if (match) indices.push(Number(match[1]));
  }
  indices.sort((a, b) => a - b);
  return indices;
}

export function listHandfulFrames(opts: {
  packageRoot: string;
  title: Title;
  indices: number[];
  offsetMs: number;
  timeScale: number;
  lineOffsets?: Record<string, number>;
  seek?: CueSeek;
}): StudioFrame[] {
  const destDir = join(opts.packageRoot, "inbox", "stills-preview", opts.title.id);
  return opts.indices.map((lineIndex) => {
    try {
      const cue = resolveCue(opts.title, lineIndex);
      const extraMs = opts.lineOffsets?.[String(lineIndex)] ?? 0;
      const seekSec = seekSeconds(
        cueAnchorMs(cue, opts.seek ?? "start"),
        opts.offsetMs,
        opts.timeScale,
        extraMs,
      );
      const file = join(destDir, stillFileName(lineIndex));
      const ok = existsSync(file);
      return {
        lineIndex,
        text: cue.text,
        seekSec,
        extraMs,
        url: `/stills/${opts.title.id}/${stillFileName(lineIndex)}`,
        ok,
        error: ok ? undefined : "Missing JPEG",
      };
    } catch (error) {
      return {
        lineIndex,
        text: "",
        seekSec: 0,
        extraMs: opts.lineOffsets?.[String(lineIndex)] ?? 0,
        url: `/stills/${opts.title.id}/${stillFileName(lineIndex)}`,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });
}
