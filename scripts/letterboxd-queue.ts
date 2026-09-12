import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  attachHighlightCounts,
  buildQueue,
  formatQueueMarkdown,
  loadQueueFromDir,
  mergeQueue,
  parseQueueFile,
  sortQueueByPriority,
} from "../src/lib/content/letterboxdQueue.js";
import {
  highlightCountsByUri,
  matchDocsToQueue,
  scanReadwiseVault,
} from "../src/lib/content/readwise.js";
import { matchHighlightsToTitles } from "../src/lib/content/starSeed.js";
import { listTitles } from "../src/lib/content/load.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOut = join(packageRoot, "content", "queue.json");

function usage(): never {
  console.log(`Usage:
  npm run content:queue -- --from <zip-or-dir> [--out content/queue.json] [--vault <readwise-dir>]

Reads an official Letterboxd export (likes ∪ ratings ≥ 4.5) and writes a
tracked movie queue sorted by priority, diary play count, then Readwise
highlights. Re-runs merge by Letterboxd URI and keep srt/converted status.

Optional --vault points at a Readwise Obsidian folder (Articles/ + Books/).
Matched highlights are written next to the queue and, for titles already in
content/titles/, a stars-seed.json for later import.`);
  process.exit(1);
}

function parseArgs(argv: string[]): { from: string; out: string; vault: string | null } {
  let from: string | undefined;
  let out = defaultOut;
  let vault: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--from") {
      from = argv[++i];
    } else if (arg === "--out") {
      out = argv[++i] ?? out;
    } else if (arg === "--vault") {
      vault = argv[++i] ?? null;
    } else if (arg === "--help" || arg === "-h") {
      usage();
    }
  }
  if (!from) usage();
  return { from: resolve(from!), out: resolve(out), vault: vault ? resolve(vault) : null };
}

function loadExisting(outPath: string): ReturnType<typeof parseQueueFile> | null {
  if (!existsSync(outPath)) return null;
  return parseQueueFile(JSON.parse(readFileSync(outPath, "utf8")));
}

function extractZip(zipPath: string): string {
  const dir = mkdtempSync(join(tmpdir(), "letterboxd-"));
  execFileSync("tar", ["-xf", zipPath, "-C", dir], { stdio: "pipe" });
  return dir;
}

function markdownPath(outPath: string): string {
  return outPath.replace(/\.json$/i, ".md");
}

function sidecar(outPath: string, name: string): string {
  return join(dirname(outPath), name);
}

function main(): void {
  const { from, out, vault } = parseArgs(process.argv.slice(2));
  if (!existsSync(from)) {
    console.error(`Not found: ${from}`);
    process.exit(1);
  }

  let sourceDir = from;
  let tmp: string | undefined;
  if (extname(from).toLowerCase() === ".zip") {
    try {
      tmp = extractZip(from);
      sourceDir = tmp;
    } catch (error) {
      console.error("Could not extract ZIP with tar. Extract it yourself and pass the folder.");
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
  }

  try {
    const { incoming, stats } = loadQueueFromDir(sourceDir);
    const previous = loadExisting(out);
    const { films, newCount } = mergeQueue(previous?.films ?? [], incoming);

    if (vault) {
      if (!existsSync(vault)) {
        console.error(`Readwise vault not found: ${vault}`);
        process.exit(1);
      }
      const docs = scanReadwiseVault(vault);
      const matches = matchDocsToQueue(docs, films);
      attachHighlightCounts(films, highlightCountsByUri(matches));
      const highlightsOut = sidecar(out, "readwise-highlights.json");
      writeFileSync(
        highlightsOut,
        `${JSON.stringify({ updatedAt: new Date().toISOString(), matches }, null, 2)}\n`,
        "utf8",
      );
      console.log(
        `Readwise: ${docs.length} notes with highlights, ${matches.length} matched to the queue → ${highlightsOut}`,
      );

      try {
        const catalogTitles = listTitles();
        const seeds = matchHighlightsToTitles(matches, catalogTitles);
        const starsOut = sidecar(out, "stars-seed.json");
        writeFileSync(
          starsOut,
          `${JSON.stringify({ updatedAt: new Date().toISOString(), stars: seeds }, null, 2)}\n`,
          "utf8",
        );
        console.log(`Star seed (already-imported titles only): ${seeds.length} lines → ${starsOut}`);
      } catch (error) {
        console.warn(
          "Skipped star matching (catalog not readable):",
          error instanceof Error ? error.message : error,
        );
      }
    }

    const queue = buildQueue(films);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
    const mdOut = markdownPath(out);
    writeFileSync(mdOut, formatQueueMarkdown(films), "utf8");

    console.log(
      `Liked: ${stats.liked}  High-rated (≥4.5): ${stats.highRated}  Unique seed: ${stats.unique}  New vs previous: ${newCount}`,
    );
    console.log(`Wrote ${films.length} films → ${out}`);
    console.log(`Checklist (priority → plays → highlights) → ${mdOut}`);
    console.log("");
    console.log("Top 20:");
    for (const film of sortQueueByPriority(films).slice(0, 20)) {
      const year = film.year ?? "?";
      const rating = film.rating ?? "—";
      const like = film.liked ? "♥" : " ";
      console.log(
        `  ${film.priority}  ${like}  ${rating}  plays:${film.playCount}  hl:${film.highlightCount}  ${film.title} (${year})`,
      );
    }
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

main();
