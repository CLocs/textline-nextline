import type { CueSeek } from "./extractStills.js";

export type StudioVote = "up" | "down";

export type StudioMethod = {
  id: string;
  label: string;
  why: string;
  offsetMs: number;
  timeScale: number;
  seek: CueSeek;
};

export type StudioVoteHint = "unknown" | "all-down" | "early-ok-late-down" | "late-ok-early-down" | "scattered";

export type StudioMethodSettings = {
  offsetMs: number;
  timeScale: number;
  seek?: CueSeek;
};

const THEME = -57_000;

function method(
  id: string,
  label: string,
  why: string,
  offsetMs: number,
  timeScale = 1,
  seek: CueSeek = "start",
): StudioMethod {
  return { id, label, why, offsetMs, timeScale, seek };
}

export function isSimpsonsShow(show: string): boolean {
  const name = show.trim().toLowerCase();
  return name === "the simpsons" || name.startsWith("the simpsons");
}

export function studioMethodsForShow(show: string): StudioMethod[] {
  if (isSimpsonsShow(show)) {
    return [
      method("theme-57", "Theme skip −57s", "TV rip starts after the opening theme.", THEME),
      method(
        "theme-52",
        "Theme skip −52s",
        "Theme is a little shorter than 57s.",
        THEME + 5_000,
      ),
      method(
        "theme-62",
        "Theme skip −62s",
        "Theme runs a little longer than 57s.",
        THEME - 5_000,
      ),
      method(
        "theme-47",
        "Theme skip −47s",
        "Bigger theme-length miss toward the SRT.",
        THEME + 10_000,
      ),
      method(
        "theme-67",
        "Theme skip −67s",
        "Bigger theme-length miss into the episode.",
        THEME - 10_000,
      ),
      method(
        "theme-57-mid",
        "Theme skip, mid-cue",
        "Seek the middle of the subtitle — helps cutaways.",
        THEME,
        1,
        "mid",
      ),
      method(
        "theme-57-pal",
        "Theme skip + PAL 0.96",
        "Early frames match, late ones drift (slow timing).",
        THEME,
        0.96,
      ),
      method("zero", "No offset", "File already matches the SRT clock.", 0),
      method("zero-pal", "PAL 0.96, no offset", "Slow 25fps rip without a theme skip.", 0, 0.96),
    ];
  }
  return [
    method("zero", "No offset", "Start at the SRT clock.", 0),
    method("pal", "PAL 0.96", "Slow 25fps DVD/PAL rip — late cues drift first.", 0, 0.96),
    method("mid", "Mid-cue", "Seek the middle of the subtitle — helps cutaways / VO.", 0, 1, "mid"),
    method("plus5", "Offset +5s", "Picture is a little early vs the quote.", 5_000),
    method("minus5", "Offset −5s", "Picture is a little late vs the quote.", -5_000),
    method("plus10", "Offset +10s", "Picture is earlier still.", 10_000),
    method("minus10", "Offset −10s", "Picture is later still.", -10_000),
    method("pal-mid", "PAL 0.96, mid-cue", "PAL timing plus mid-cue seek.", 0, 0.96, "mid"),
  ];
}

export function methodSettingsKey(settings: StudioMethodSettings): string {
  const seek = settings.seek === "mid" ? "mid" : "start";
  const scale = settings.timeScale === 0.96 ? "0.96" : "1";
  return `${Math.round(settings.offsetMs)}:${scale}:${seek}`;
}

export function matchStudioMethod(show: string, settings: StudioMethodSettings): StudioMethod | null {
  const seek = settings.seek === "mid" ? "mid" : "start";
  for (const row of studioMethodsForShow(show)) {
    if (row.seek !== seek) continue;
    if (Math.abs(row.timeScale - settings.timeScale) > 0.005) continue;
    if (Math.abs(row.offsetMs - settings.offsetMs) > 400) continue;
    return row;
  }
  return null;
}

export function describeStudioMethod(show: string, settings: StudioMethodSettings): StudioMethod {
  const named = matchStudioMethod(show, settings);
  if (named) return named;
  const seek = settings.seek === "mid" ? "mid" : "start";
  const scale = settings.timeScale === 0.96 ? "PAL 0.96" : "scale 1";
  const offset = `${settings.offsetMs / 1000}s`;
  return {
    id: `custom:${methodSettingsKey(settings)}`,
    label: `Custom ${offset} · ${scale}${seek === "mid" ? " · mid-cue" : ""}`,
    why: "Manual knobs — not a named recipe.",
    offsetMs: settings.offsetMs,
    timeScale: settings.timeScale,
    seek,
  };
}

export function studioVoteHint(
  frameOrder: number[],
  votes: Record<number, StudioVote> | Record<string, StudioVote> | undefined,
): StudioVoteHint {
  if (!votes || frameOrder.length === 0) return "unknown";
  const get = (lineIndex: number): StudioVote | undefined =>
    votes[lineIndex] ?? votes[String(lineIndex)];
  const downs = frameOrder.filter((line) => get(line) === "down");
  if (downs.length === 0) return "unknown";
  const split = Math.ceil(frameOrder.length / 2);
  const early = frameOrder.slice(0, split);
  const late = frameOrder.slice(split);
  const earlyDown = early.filter((line) => get(line) === "down").length;
  const lateDown = late.filter((line) => get(line) === "down").length;
  if (lateDown >= 2 && earlyDown === 0) return "early-ok-late-down";
  if (earlyDown >= 2 && lateDown === 0) return "late-ok-early-down";
  if (downs.length >= Math.max(3, frameOrder.length - 1)) return "all-down";
  return "scattered";
}

function isPalFps(fps: number | null | undefined): boolean {
  return fps != null && fps >= 24.5 && fps <= 25.5;
}

function isNtscFps(fps: number | null | undefined): boolean {
  return fps != null && fps >= 29 && fps <= 31;
}

function scoreMethod(
  method: StudioMethod,
  opts: {
    hint: StudioVoteHint;
    fps?: number | null;
    currentOffsetMs: number;
    show: string;
  },
): number {
  let score = 0;
  const pal = method.timeScale === 0.96;
  if (opts.hint === "early-ok-late-down" && pal) score += 80;
  if (opts.hint === "early-ok-late-down" && !pal) score -= 10;
  if (isPalFps(opts.fps) && pal) score += 50;
  if (isNtscFps(opts.fps) && pal) score -= 40;
  if (isSimpsonsShow(opts.show) && pal && opts.hint !== "early-ok-late-down" && !isPalFps(opts.fps)) {
    score -= 25;
  }
  if (opts.hint === "scattered" && method.seek === "mid") score += 40;
  if (opts.hint === "all-down") {
    const delta = Math.abs(method.offsetMs - opts.currentOffsetMs);
    if (delta > 0 && delta <= 12_000) score += 35;
    if (pal) score -= 15;
  }
  if (opts.hint === "late-ok-early-down" && method.offsetMs > opts.currentOffsetMs) score += 30;
  return score;
}

export function pickNextStudioMethod(opts: {
  show: string;
  fps?: number | null;
  current: StudioMethodSettings;
  triedIds?: string[];
  votes?: Record<number, StudioVote> | Record<string, StudioVote>;
  frameOrder: number[];
}): StudioMethod | null {
  const catalog = studioMethodsForShow(opts.show);
  const current = describeStudioMethod(opts.show, opts.current);
  const tried = new Set([...(opts.triedIds ?? []), current.id].filter(Boolean));
  const remaining = catalog.filter((row) => !tried.has(row.id));
  if (remaining.length === 0) return null;
  const hint = studioVoteHint(opts.frameOrder, opts.votes);
  const ranked = [...remaining].sort((a, b) => {
    const delta =
      scoreMethod(b, { hint, fps: opts.fps, currentOffsetMs: opts.current.offsetMs, show: opts.show }) -
      scoreMethod(a, { hint, fps: opts.fps, currentOffsetMs: opts.current.offsetMs, show: opts.show });
    if (delta !== 0) return delta;
    return catalog.indexOf(a) - catalog.indexOf(b);
  });
  return ranked[0] ?? null;
}

export function recordTriedMethodIds(
  previous: string[] | undefined,
  ...ids: (string | null | undefined)[]
): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of [...(previous ?? []), ...ids]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
}
