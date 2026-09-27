import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { STILLS_R2_BUCKET, stillObjectKey } from "./stillKeys.js";
import { listRemoteStills } from "./stillsR2.js";
import { stillNeedsUpload } from "./stillsSyncPlan.js";

const CONCURRENCY = 4;

export type StillPushFile = { titleId: string; file: string; key: string };

export type StillPushResult = {
  uploaded: number;
  unchanged: number;
  planned: number;
};

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

function fileMd5(file: string): string {
  return createHash("md5").update(readFileSync(file)).digest("hex");
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
  opts?: {
    previewRoot?: string;
    force?: boolean;
    dryRun?: boolean;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<StillPushResult> {
  const previewRoot = opts?.previewRoot ?? join(packageRoot, "inbox", "stills-preview");
  const files = listPreviewStillFiles(previewRoot, titleId);
  if (files.length === 0) {
    throw new Error(`No preview JPEGs for ${titleId}.`);
  }

  const remote = opts?.force ? null : await listRemoteStills(packageRoot, `${titleId}/`);
  const pending: StillPushFile[] = [];
  let unchanged = 0;
  for (const item of files) {
    const size = statSync(item.file).size;
    const current = remote?.get(item.key);
    const md5 = current && current.size === size ? fileMd5(item.file) : undefined;
    if (remote && !stillNeedsUpload({ size, md5 }, current)) {
      unchanged += 1;
      continue;
    }
    pending.push(item);
  }

  opts?.onProgress?.(0, pending.length);
  if (opts?.dryRun || pending.length === 0) {
    return { uploaded: 0, unchanged, planned: pending.length };
  }

  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    while (next < pending.length) {
      const i = next;
      next += 1;
      const item = pending[i]!;
      await putObject(packageRoot, item.key, item.file);
      done += 1;
      opts?.onProgress?.(done, pending.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, () => worker()));
  return { uploaded: done, unchanged, planned: pending.length };
}
