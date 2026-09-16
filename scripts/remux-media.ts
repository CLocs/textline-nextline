import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { titlePath } from "../src/lib/content/load.js";
import { ffmpegRemuxArgs, mediaRemuxOutput } from "../src/lib/content/extractStills.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function usage(): never {
  console.log(`Usage:
  npm run content:stills:remux -- --title oceans-thirteen-2007 --input "G:\\videos\\movies\\Ocean's 13 (2007).avi"

Stream-copy the local movie into inbox/media/{titleId}.mkv (gitignored). Needs ffmpeg on PATH.

  --title   Catalog title id (required)
  --input   Source video path (required)
`);
  process.exit(1);
}

function parseArgs(argv: string[]): { titleId: string; input: string } {
  let titleId = "";
  let input = "";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") titleId = argv[++i] ?? "";
    else if (arg === "--input") input = argv[++i] ?? "";
    else if (arg === "--help" || arg === "-h") usage();
  }
  if (!titleId.trim() || !input.trim()) usage();
  return { titleId: titleId.trim(), input: resolve(input) };
}

function main(): void {
  const { titleId, input } = parseArgs(process.argv.slice(2));
  if (!existsSync(titlePath(titleId))) {
    console.error(`Title not found: content/titles/${titleId}.json`);
    process.exit(1);
  }
  if (!existsSync(input)) {
    console.error(`Video not found: ${input}`);
    process.exit(1);
  }

  const output = mediaRemuxOutput(packageRoot, titleId);
  mkdirSync(dirname(output), { recursive: true });
  const args = ffmpegRemuxArgs({ input, output });
  console.log(`Remux ${input} → ${output}`);
  try {
    execFileSync("ffmpeg", args, { stdio: "inherit" });
  } catch {
    console.error("ffmpeg remux failed.");
    process.exit(1);
  }
  if (!existsSync(output)) {
    console.error(`No remux written: ${output}`);
    process.exit(1);
  }
  console.log(`Wrote ${output}`);
}

main();
