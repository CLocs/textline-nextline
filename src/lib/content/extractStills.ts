import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Line, Title } from "../../types/content.js";

/** `mid` grabs the middle of the subtitle cue (helps Ritchie reverse-shot / VO). */
export type CueSeek = "start" | "mid";

export type StillsSyncEntry = {
  offsetMs: number;
  timeScale?: number;
  seek?: CueSeek;
  encode?: string;
  source?: string;
  fps?: number;
  durationSec?: number;
  note?: string;
};

export type StillsSyncFile = Record<string, StillsSyncEntry>;

/** Parse `--indices 0,41,328` into unique line numbers (order preserved). */
export function parseLineIndices(raw: string): number[] {
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  const indices: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      throw new Error(`Invalid line index: ${part}`);
    }
    const n = Number(part);
    if (seen.has(n)) continue;
    seen.add(n);
    indices.push(n);
  }
  if (indices.length === 0) {
    throw new Error("Provide at least one line index.");
  }
  return indices;
}

export function seekSeconds(startMs: number, offsetMs: number, timeScale = 1): number {
  const ms = startMs * timeScale + offsetMs;
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid seek: startMs=${startMs} offsetMs=${offsetMs} timeScale=${timeScale}`);
  }
  return ms / 1000;
}

export function cueAnchorMs(cue: Pick<Line, "startMs" | "endMs">, seek: CueSeek = "start"): number {
  if (seek === "mid") return (cue.startMs + cue.endMs) / 2;
  return cue.startMs;
}

export function seekModeForTitle(sync: StillsSyncFile, titleId: string): CueSeek {
  return sync[titleId]?.seek === "mid" ? "mid" : "start";
}

export function resolveCue(title: Title, lineIndex: number): Line {
  const line = title.lines.find((cue) => cue.index === lineIndex);
  if (!line) {
    throw new Error(`No line ${lineIndex} in ${title.id}`);
  }
  return line;
}

export function stillFileName(lineIndex: number): string {
  return `${lineIndex}.jpg`;
}

export function offsetMsForTitle(sync: StillsSyncFile, titleId: string): number {
  const entry = sync[titleId];
  if (!entry || !Number.isFinite(entry.offsetMs)) return 0;
  return entry.offsetMs;
}

/** PAL 25fps vs theatrical 24fps is 0.96. Missing/invalid → 1. */
export function timeScaleForTitle(sync: StillsSyncFile, titleId: string): number {
  const scale = sync[titleId]?.timeScale;
  if (scale == null || !Number.isFinite(scale) || scale <= 0) return 1;
  return scale;
}

export function loadStillsSyncFile(path: string): StillsSyncFile {
  if (!existsSync(path)) return {};
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("stills-sync.json must be an object keyed by title id.");
  }
  return raw as StillsSyncFile;
}

/**
 * Coarse input seek, then a short accurate output seek.
 * `-ss` after `-i` is the accurate part; preroll keeps late cues from decoding the whole film.
 */
export function ffmpegExtractArgs(opts: {
  input: string;
  seekSec: number;
  output: string;
}): string[] {
  const preroll = Math.min(2, Math.max(0, opts.seekSec));
  const inputSeek = opts.seekSec - preroll;
  const args: string[] = ["-hide_banner", "-loglevel", "error"];
  if (inputSeek > 0) {
    args.push("-ss", inputSeek.toFixed(3));
  }
  args.push(
    "-i",
    opts.input,
    "-ss",
    preroll.toFixed(3),
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-vf",
    "scale=1280:-1",
    "-y",
    opts.output,
  );
  return args;
}

const TITLE_ID_RE = /^[a-z0-9-]+$/i;

export function mediaRemuxOutput(packageRoot: string, titleId: string): string {
  if (!TITLE_ID_RE.test(titleId)) {
    throw new Error(`Invalid title id: ${titleId}`);
  }
  return join(packageRoot, "inbox", "media", `${titleId}.mkv`);
}

/** AVI/Xvid often has no packet timestamps; genpts lets MKV copy. */
export function ffmpegRemuxArgs(opts: { input: string; output: string }): string[] {
  return [
    "-hide_banner",
    "-fflags",
    "+genpts",
    "-i",
    opts.input,
    "-c",
    "copy",
    "-y",
    opts.output,
  ];
}
