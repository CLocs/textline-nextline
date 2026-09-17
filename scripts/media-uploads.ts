import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../src/lib/content/load.js";
import {
  formatUploadsMarkdown,
  listVideoFilenames,
  matchUploadsToCatalog,
  scanStillsPreview,
  type StillsCoverageFile,
  type UploadsSnapshot,
} from "../src/lib/content/mediaUploads.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultDir = "G:\\videos\\movies";
const defaultPreview = join(packageRoot, "inbox", "stills-preview");
const defaultUploads = join(packageRoot, "content", "uploads.json");
const defaultCoverage = join(packageRoot, "content", "stills-coverage.json");

function usage(): never {
  console.log(`Usage:
  npm run content:uploads -- [--dir G:\\videos\\movies] [--preview inbox/stills-preview]

Scans local movie files against content/catalog.json and counts quote stills
in inbox/stills-preview. Writes content/uploads.json, content/uploads.md, and
content/stills-coverage.json.`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  dir: string;
  preview: string;
  uploadsOut: string;
  coverageOut: string;
} {
  let dir = defaultDir;
  let preview = defaultPreview;
  let uploadsOut = defaultUploads;
  let coverageOut = defaultCoverage;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dir") dir = argv[++i] ?? dir;
    else if (arg === "--preview") preview = argv[++i] ?? preview;
    else if (arg === "--out") uploadsOut = argv[++i] ?? uploadsOut;
    else if (arg === "--coverage-out") coverageOut = argv[++i] ?? coverageOut;
    else if (arg === "--help" || arg === "-h") usage();
  }
  return {
    dir: resolve(dir),
    preview: resolve(preview),
    uploadsOut: resolve(uploadsOut),
    coverageOut: resolve(coverageOut),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const catalog = loadCatalog();
  const filenames = listVideoFilenames(args.dir);
  const { matched, unmatched } = matchUploadsToCatalog(filenames, catalog.titles);
  const snapshot: UploadsSnapshot = {
    updatedAt: new Date().toISOString(),
    directory: args.dir,
    matched,
    unmatched,
  };
  const previewScan = scanStillsPreview(args.preview);
  const coverage: StillsCoverageFile = {
    updatedAt: snapshot.updatedAt,
    titles: previewScan.titles,
    covers: previewScan.covers,
  };

  writeFileSync(args.uploadsOut, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(args.uploadsOut.replace(/\.json$/i, ".md"), formatUploadsMarkdown(snapshot));
  writeFileSync(args.coverageOut, `${JSON.stringify(coverage, null, 2)}\n`);

  const haveMedia = matched.filter((row) => row.status !== "missing").length;
  console.log(
    `${haveMedia}/${matched.length} catalog movies have files · ${unmatched.length} unmatched · ${Object.keys(coverage.titles).length} titles with stills`,
  );
  console.log(`Wrote ${args.uploadsOut}`);
}

main();
