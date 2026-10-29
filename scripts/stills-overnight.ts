/**
 * Batch every title whose clock is synced and not yet batched.
 * Skips review rows (no syncedAt). Does not push to R2.
 * Movies stay on this machine: npm run content:stills:overnight
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadStillsSyncFile } from "../src/lib/content/extractStills.js";
import { writeStillsSyncFile } from "../src/lib/content/stillsStudio.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const syncPath = join(root, "content", "stills-sync.json");
const logDir = join(root, "inbox", "stills-preview");
const logPath = join(logDir, "playable-overnight.log");

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  appendFileSync(logPath, `${line}\n`);
  console.log(line);
}

function waitingIds(): string[] {
  const sync = loadStillsSyncFile(syncPath);
  return Object.entries(sync)
    .filter(([, entry]) => entry.syncedAt && !entry.batchedAt && !entry.pushedAt)
    .filter(([, entry]) => !entry.source || existsSync(entry.source))
    .map(([id]) => id)
    .sort();
}

function stampBatched(titleId: string): void {
  const sync = loadStillsSyncFile(syncPath);
  const entry = sync[titleId];
  if (!entry?.syncedAt || entry.batchedAt) return;
  entry.batchedAt = new Date().toISOString();
  writeStillsSyncFile(syncPath, sync);
}

mkdirSync(logDir, { recursive: true });
const titles = waitingIds();
log(`queue start (${titles.length} synced, not yet batched)`);
if (titles.length === 0) {
  log("nothing synced is waiting. Review rows stay put.");
}

for (const titleId of titles) {
  log(`START ${titleId}`);
  const result = spawnSync(
    "npm",
    ["run", "content:stills", "--", "--title", titleId, "--playable"],
    { cwd: root, shell: true, encoding: "utf8" },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (output.trim()) appendFileSync(logPath, output.endsWith("\n") ? output : `${output}\n`);
  const failed = Number(output.match(/failed (\d+)/)?.[1] ?? (result.status === 0 ? 0 : 1));
  if (result.status === 0 && failed === 0) {
    stampBatched(titleId);
    log(`END ${titleId} batched`);
  } else {
    log(`END ${titleId} held (exit ${result.status ?? "null"}, failed ${failed})`);
  }
}
log("queue done");
