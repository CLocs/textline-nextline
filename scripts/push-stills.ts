import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { STILLS_R2_BUCKET } from "../src/lib/content/stillKeys.js";
import { pushPreviewStills } from "../src/lib/content/stillsPush.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultPreview = join(packageRoot, "inbox", "stills-preview");

function usage(): never {
  console.log(`Usage:
  npm run content:stills:push -- [--title oceans-thirteen-2007] [--dry-run] [--force]

Syncs preview JPEGs to the private R2 bucket ${STILLS_R2_BUCKET}.
Lists objects already in the bucket and uploads only missing keys or files
whose size/MD5 changed. Same-size matches are hashed before skip.
Repeat --title to limit folders (default: every preview folder).
--dry-run prints the plan. --force re-uploads every local JPEG.
Pages serves them at /stills/{titleId}/{line}.jpg. Remote-only objects are left in place.`);
  process.exit(1);
}

function parseArgs(argv: string[]): { titles: string[]; preview: string; dryRun: boolean; force: boolean } {
  const titles: string[] = [];
  let preview = defaultPreview;
  let dryRun = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") {
      const raw = argv[++i] ?? "";
      for (const id of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
        titles.push(id);
      }
    } else if (arg === "--preview") preview = argv[++i] ?? preview;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--force") force = true;
    else if (arg === "--help" || arg === "-h") usage();
  }
  return { titles, preview: resolve(preview), dryRun, force };
}

function previewTitleIds(previewRoot: string, titleFilter: string[]): string[] {
  if (!existsSync(previewRoot) || !statSync(previewRoot).isDirectory()) {
    throw new Error(`Preview folder not found: ${previewRoot}`);
  }
  const allow = new Set(titleFilter);
  const ids = readdirSync(previewRoot, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((name) => allow.size === 0 || allow.has(name))
    .sort((a, b) => a.localeCompare(b));
  for (const id of titleFilter) {
    if (!ids.includes(id)) throw new Error(`No preview folder for ${id}.`);
  }
  return ids;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const titles = previewTitleIds(args.preview, args.titles);
  if (titles.length === 0) {
    console.error("No still folders to sync.");
    process.exit(1);
  }
  console.log(
    args.force
      ? `Force upload of ${titles.length} title(s) → R2 ${STILLS_R2_BUCKET}`
      : `Sync ${titles.length} title(s) → R2 ${STILLS_R2_BUCKET}${args.dryRun ? " (dry run)" : ""}`,
  );
  let uploaded = 0;
  let unchanged = 0;
  let planned = 0;
  for (const titleId of titles) {
    const result = await pushPreviewStills(packageRoot, titleId, {
      previewRoot: args.preview,
      force: args.force,
      dryRun: args.dryRun,
      onProgress(done, total) {
        if (done === 0 || done === total || done % 25 === 0) {
          console.log(`[${titleId}] ${done}/${total}`);
        }
      },
    });
    uploaded += result.uploaded;
    unchanged += result.unchanged;
    planned += result.planned;
    console.log(
      `${titleId}: ${args.dryRun ? "would upload" : "uploaded"} ${args.dryRun ? result.planned : result.uploaded}, unchanged ${result.unchanged}`,
    );
  }
  console.log(
    args.dryRun
      ? `Would upload ${planned}, unchanged ${unchanged}.`
      : `Uploaded ${uploaded}, unchanged ${unchanged}.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
