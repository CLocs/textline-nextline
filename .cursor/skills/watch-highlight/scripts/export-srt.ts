/**
 * One SRT/VTT → transcript_maker timed JSON for `npm run import`.
 * Uses the sibling transcript_maker cleaners. batch:export is not in that repo.
 *
 * npx tsx .cursor/skills/watch-highlight/scripts/export-srt.ts \
 *   --srt inbox/srt/FILE.srt --out imports/Name-Year.json \
 *   --title "Name (Year)" --year 1997 --source "Name.Year.eng.srt"
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Args = {
  srt: string;
  out: string;
  title: string;
  year?: number;
  source: string;
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function parseArgs(): Args {
  const srt = arg("--srt");
  const out = arg("--out");
  const title = arg("--title");
  const yearRaw = arg("--year");
  const source = arg("--source");
  if (!srt || !out || !title || !source) {
    throw new Error("Required: --srt --out --title --source [--year]");
  }
  const year = yearRaw === undefined ? undefined : Number(yearRaw);
  if (year !== undefined && !Number.isInteger(year)) {
    throw new Error(`--year must be an integer, got ${yearRaw}`);
  }
  return { srt, out, title, year, source };
}

function findMaker(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../../../../transcript_maker"),
    resolve(here, "../../../../transcript_maker"),
  ];
  const found = candidates.find((dir) => existsSync(join(dir, "src/lib/subtitle/parse.ts")));
  if (!found) {
    throw new Error(`transcript_maker not found. Looked in:\n${candidates.join("\n")}`);
  }
  return found;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const maker = findMaker();
  const { parseSubtitle } = await import(
    pathToFileURL(join(maker, "src/lib/subtitle/parse.ts")).href
  );
  const { generateTranscript } = await import(
    pathToFileURL(join(maker, "src/lib/subtitle/clean.ts")).href
  );
  const { defaultCleanOptions } = await import(
    pathToFileURL(join(maker, "src/types/index.ts")).href
  );

  const cues = parseSubtitle(readFileSync(args.srt, "utf8"));
  if (cues.length < 500) {
    throw new Error(`Only ${cues.length} cues. Refusing a short or partial track.`);
  }
  const blocks = generateTranscript(cues, defaultCleanOptions);
  const last = cues[cues.length - 1];
  const work = {
    title: args.title,
    sourceFilename: args.source,
    ...(args.year !== undefined
      ? { film: { title: args.title.replace(/\s*\(\d{4}\)\s*$/, ""), year: args.year } }
      : {}),
    cues,
    transcript: {
      generatedAt: Date.now(),
      options: defaultCleanOptions,
      blocks,
    },
  };
  writeFileSync(args.out, `${JSON.stringify(work, null, 2)}\n`);
  console.log(
    `Exported ${cues.length} cues, ${blocks.length} lines, last cue ${last?.endMs}ms → ${args.out}`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
