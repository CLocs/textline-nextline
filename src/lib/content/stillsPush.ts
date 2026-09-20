import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { STILLS_R2_BUCKET, stillObjectKey } from "./stillKeys.js";

const CONCURRENCY = 4;

export type StillPushFile = { titleId: string; file: string; key: string };

export function listPreviewStillFiles(previewRoot: string, titleId: string): StillPushFile[] {
  const folder = join(previewRoot, titleId);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) return [];
  const files: StillPushFile[] = [];
  for (const name of readdirSync(folder)) {
    const key = stillObjectKey(titleId, name);
    if (!key) continue;
    files.push({ titleId, file: join(folder, name), key });
  }
  files.sort((a, b) => a.key.localeCompare(b.key));
  return files;
}

function putObject(packageRoot: string, key: string, file: string): Promise<void> {
  const wranglerJs = join(packageRoot, "node_modules", "wrangler", "bin", "wrangler.js");
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

export async function pushPreviewStills(
  packageRoot: string,
  titleId: string,
  opts?: { onProgress?: (done: number, total: number) => void },
): Promise<{ uploaded: number }> {
  const previewRoot = join(packageRoot, "inbox", "stills-preview");
  const files = listPreviewStillFiles(previewRoot, titleId);
  if (files.length === 0) {
    throw new Error(`No preview JPEGs for ${titleId}.`);
  }
  let next = 0;
  let done = 0;
  opts?.onProgress?.(0, files.length);
  async function worker(): Promise<void> {
    while (next < files.length) {
      const i = next;
      next += 1;
      const item = files[i]!;
      await putObject(packageRoot, item.key, item.file);
      done += 1;
      opts?.onProgress?.(done, files.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker()));
  return { uploaded: done };
}
