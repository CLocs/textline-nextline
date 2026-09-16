import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { STILLS_R2_BUCKET, stillObjectKey } from "../src/lib/content/stillKeys.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerJs = join(packageRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const defaultPreview = join(packageRoot, "inbox", "stills-preview");
const CONCURRENCY = 4;

function usage(): never {
  console.log(`Usage:
  npm run content:stills:push -- [--title oceans-thirteen-2007] [--preview inbox/stills-preview]

Uploads gitignored preview JPEGs to the private R2 bucket ${STILLS_R2_BUCKET}.
Repeat --title to limit folders (default: every folder). Pages serves them at
/stills/{titleId}/{line}.jpg after the next Pages deploy.`);
  process.exit(1);
}

function parseArgs(argv: string[]): { titles: string[]; preview: string } {
  const titles: string[] = [];
  let preview = defaultPreview;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--title") {
      const raw = argv[++i] ?? "";
      for (const id of raw.split(",").map((part) => part.trim()).filter(Boolean)) {
        titles.push(id);
      }
    } else if (arg === "--preview") preview = argv[++i] ?? preview;
    else if (arg === "--help" || arg === "-h") usage();
  }
  return { titles, preview: resolve(preview) };
}

type StillFile = { titleId: string; file: string; key: string };

function listStillFiles(previewRoot: string, titleFilter: string[]): StillFile[] {
  if (!existsSync(previewRoot) || !statSync(previewRoot).isDirectory()) {
    throw new Error(`Preview folder not found: ${previewRoot}`);
  }
  const allow = new Set(titleFilter);
  const files: StillFile[] = [];
  for (const dirent of readdirSync(previewRoot, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    if (allow.size > 0 && !allow.has(dirent.name)) continue;
    const folder = join(previewRoot, dirent.name);
    for (const name of readdirSync(folder)) {
      const key = stillObjectKey(dirent.name, name);
      if (!key) continue;
      files.push({ titleId: dirent.name, file: join(folder, name), key });
    }
  }
  files.sort((a, b) => a.key.localeCompare(b.key));
  return files;
}

function putObject(key: string, file: string): Promise<void> {
  return new Promise((resolvePut, reject) => {
    execFile(
      process.execPath,
      [
        wranglerJs,
        "r2",
        "object",
        "put",
        `${STILLS_R2_BUCKET}/${key}`,
        "--file",
        file,
        "--content-type",
        "image/jpeg",
        "--cache-control",
        "public, max-age=31536000, immutable",
        "--remote",
        "-y",
      ],
      { cwd: packageRoot },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolvePut();
      },
    );
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const files = listStillFiles(args.preview, args.titles);
  if (files.length === 0) {
    console.error("No still JPEGs to upload.");
    process.exit(1);
  }
  console.log(`Uploading ${files.length} still(s) → R2 ${STILLS_R2_BUCKET}`);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (next < files.length) {
      const i = next;
      next += 1;
      const item = files[i]!;
      console.log(`[${i + 1}/${files.length}] ${item.key}`);
      await putObject(item.key, item.file);
      done += 1;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()));
  console.log(`Uploaded ${done} still(s).`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
