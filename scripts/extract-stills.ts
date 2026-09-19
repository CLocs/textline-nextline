import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadTitle, titlePath } from "../src/lib/content/load.js";
import { sqlString } from "../src/lib/content/starsPush.js";
import {
  ffmpegExtractArgs,
  cueAnchorMs,
  loadStillsSyncFile,
  offsetMsForTitle,
  parseLineIndices,
  resolveCue,
  seekModeForTitle,
  seekSeconds,
  stillFileName,
  timeScaleForTitle,
  type CueSeek,
} from "../src/lib/content/extractStills.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = join(packageRoot, "api");
const defaultSync = join(packageRoot, "content", "stills-sync.json");

function usage(): never {
  console.log(`Usage:
  npm run content:stills -- --title oceans-thirteen-2007 --indices 40,58,70
  npm run content:stills -- --title oceans-thirteen-2007 --from-stars --email you@example.com --remote

Extract one JPEG per line at startMs (plus offset, times timeScale from stills-sync.json).
Use --mid-cue when reverse-shots / VO make startMs land on the previous picture.

  --title       Catalog title id (required)
  --indices     Comma-separated line indices
  --from-stars  Use this user's D1 stars for the title instead of --indices
  --email       Required with --from-stars
  --remote      Read production D1 (textline-stars). Default is local wrangler D1.
  --input       Video file. Default: inbox/media/{titleId}.mkv
  --out         Output directory. Default: inbox/stills-preview
  --offset-ms   Override stills-sync offsetMs
  --time-scale  Override stills-sync timeScale (PAL 25fps is 0.96)
  --mid-cue     Seek to (startMs+endMs)/2 instead of startMs
  --accurate-seek  Decode from start (`-ss` after `-i`). Use for DIV3/sparse keyframes.
  --sync        Path to stills-sync.json
`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  titleId: string;
  indicesRaw: string;
  fromStars: boolean;
  email: string;
  remote: boolean;
  input: string | null;
  outDir: string;
  offsetMs: number | null;
  timeScale: number | null;
  seek: CueSeek | null;
  accurateSeek: boolean;
  syncPath: string;
} {
  let titleId = "";
  let indicesRaw = "";
  let fromStars = false;
  let email = "";
  let remote = false;
  let input: string | null = null;
  let outDir = join(packageRoot, "inbox", "stills-preview");
  let offsetMs: number | null = null;
  let timeScale: number | null = null;
  let seek: CueSeek | null = null;
  let accurateSeek = false;
  let syncPath = defaultSync;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") titleId = argv[++i] ?? "";
    else if (arg === "--indices") indicesRaw = argv[++i] ?? "";
    else if (arg === "--from-stars") fromStars = true;
    else if (arg === "--email") email = argv[++i] ?? "";
    else if (arg === "--remote") remote = true;
    else if (arg === "--input") input = argv[++i] ?? "";
    else if (arg === "--out") outDir = argv[++i] ?? outDir;
    else if (arg === "--offset-ms") offsetMs = Number(argv[++i] ?? "0");
    else if (arg === "--time-scale") timeScale = Number(argv[++i] ?? "1");
    else if (arg === "--mid-cue") seek = "mid";
    else if (arg === "--accurate-seek") accurateSeek = true;
    else if (arg === "--sync") syncPath = argv[++i] ?? syncPath;
    else if (arg === "--help" || arg === "-h") usage();
  }
  if (!titleId.trim()) usage();
  if (fromStars === Boolean(indicesRaw.trim())) usage();
  if (fromStars && !email.trim()) usage();
  if (offsetMs != null && !Number.isFinite(offsetMs)) {
    console.error("--offset-ms must be a number.");
    process.exit(1);
  }
  if (timeScale != null && (!Number.isFinite(timeScale) || timeScale <= 0)) {
    console.error("--time-scale must be a positive number.");
    process.exit(1);
  }
  return {
    titleId: titleId.trim(),
    indicesRaw: indicesRaw.trim(),
    fromStars,
    email: email.trim(),
    remote,
    input: input ? resolve(input) : null,
    outDir: resolve(outDir),
    offsetMs,
    timeScale,
    seek,
    accurateSeek,
    syncPath: resolve(syncPath),
  };
}

function d1Json(command: string, remote: boolean): unknown {
  const wranglerJs = join(packageRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const args = [
    wranglerJs,
    "d1",
    "execute",
    "textline-stars",
    remote ? "--remote" : "--local",
    "--json",
    "--command",
    command,
  ];
  const raw = execFileSync(process.execPath, args, {
    cwd: apiDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

function firstRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    const block = payload[0] as { results?: Record<string, unknown>[] } | undefined;
    return block?.results ?? [];
  }
  if (payload && typeof payload === "object" && "results" in payload) {
    const results = (payload as { results?: unknown }).results;
    if (Array.isArray(results)) return results as Record<string, unknown>[];
  }
  return [];
}

function lookupUserId(email: string, remote: boolean): string {
  const payload = d1Json(
    `SELECT id, email FROM users WHERE lower(email) = lower(${sqlString(email)}) LIMIT 1;`,
    remote,
  );
  const row = firstRows(payload)[0];
  const id = row?.id;
  if (typeof id !== "string" || !id) {
    throw new Error(
      `No user row for ${email}. Sign in once on the live app (magic link), then retry.`,
    );
  }
  return id;
}

function fetchStarIndices(titleId: string, email: string, remote: boolean): number[] {
  const userId = lookupUserId(email, remote);
  const payload = d1Json(
    `SELECT line_index FROM stars WHERE player_id = ${sqlString(userId)} AND title_id = ${sqlString(titleId)} ORDER BY line_index ASC;`,
    remote,
  );
  const indices: number[] = [];
  for (const row of firstRows(payload)) {
    const n = Number(row.line_index);
    if (Number.isInteger(n) && n >= 0) indices.push(n);
  }
  if (indices.length === 0) {
    throw new Error(`No D1 stars for ${titleId} (${email}).`);
  }
  return indices;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(titlePath(args.titleId))) {
    console.error(`Title not found: content/titles/${args.titleId}.json`);
    process.exit(1);
  }

  const title = loadTitle(args.titleId);
  const input = args.input ?? join(packageRoot, "inbox", "media", `${args.titleId}.mkv`);
  if (!existsSync(input)) {
    console.error(`Video not found: ${input}`);
    process.exit(1);
  }

  const sync = loadStillsSyncFile(args.syncPath);
  const offsetMs = args.offsetMs ?? offsetMsForTitle(sync, args.titleId);
  const timeScale = args.timeScale ?? timeScaleForTitle(sync, args.titleId);
  const seek = args.seek ?? seekModeForTitle(sync, args.titleId);
  const indices = args.fromStars
    ? fetchStarIndices(args.titleId, args.email, args.remote)
    : parseLineIndices(args.indicesRaw);

  const destDir = join(args.outDir, args.titleId);
  mkdirSync(destDir, { recursive: true });
  console.log(
    `${indices.length} still(s)  offsetMs=${offsetMs}  timeScale=${timeScale}  seek=${seek}  accurate=${args.accurateSeek}  ${args.remote ? "remote" : "local"} D1=${args.fromStars}`,
  );

  for (const lineIndex of indices) {
    const cue = resolveCue(title, lineIndex);
    const seekSec = seekSeconds(cueAnchorMs(cue, seek), offsetMs, timeScale);
    const output = join(destDir, stillFileName(lineIndex));
    const ffmpegArgs = ffmpegExtractArgs({ input, seekSec, output, accurateSeek: args.accurateSeek });
    console.log(`line ${lineIndex}  ${seekSec.toFixed(3)}s  ${cue.text.slice(0, 60)}`);
    try {
      execFileSync("ffmpeg", ffmpegArgs, { stdio: "inherit" });
    } catch {
      console.error(`ffmpeg failed for line ${lineIndex}`);
      process.exit(1);
    }
    if (!existsSync(output)) {
      console.error(`No still written for line ${lineIndex} (seek past end of file?)`);
      process.exit(1);
    }
  }
  console.log(`Wrote ${indices.length} still(s) → ${destDir}`);
}

main();
