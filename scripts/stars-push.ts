import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  chunk,
  countByTitle,
  insertStarsSql,
  loadStarSeedFile,
  sqlString,
} from "../src/lib/content/starsPush.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSeed = join(packageRoot, "content", "stars-seed.json");
const apiDir = join(packageRoot, "api");

function usage(): never {
  console.log(`Usage:
  npm run content:stars-push -- --email you@example.com [--remote] [--seed content/stars-seed.json]

Inserts Readwise-matched lines from stars-seed.json into Cloudflare D1 as YOUR stars
(player_id = users.id for that email). Safe to re-run (ON CONFLICT DO NOTHING).

  --email     Required. Must already have signed in on the live app once.
  --remote    Write production D1 (textline-stars). Default is local wrangler D1.
  --seed      Path to stars-seed.json
  --dry-run   Print counts only; do not write.`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  email: string;
  remote: boolean;
  seed: string;
  dryRun: boolean;
} {
  let email = "";
  let remote = false;
  let seed = defaultSeed;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") email = argv[++i] ?? "";
    else if (arg === "--remote") remote = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--seed") seed = argv[++i] ?? seed;
    else if (arg === "--help" || arg === "-h") usage();
  }
  if (!email.trim()) usage();
  return { email: email.trim(), remote, seed: resolve(seed), dryRun };
}

function d1Json(command: string, remote: boolean): unknown {
  const args = [
    "wrangler",
    "d1",
    "execute",
    "textline-stars",
    remote ? "--remote" : "--local",
    "--json",
    "--command",
    command,
  ];
  const raw = execFileSync("npx", args, {
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

function main(): void {
  const { email, remote, seed, dryRun } = parseArgs(process.argv.slice(2));
  if (!existsSync(seed)) {
    console.error(`Seed not found: ${seed}`);
    process.exit(1);
  }

  const stars = loadStarSeedFile(seed);
  console.log(`${stars.length} seed stars from ${seed}`);
  for (const [title, n] of [...countByTitle(stars).entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${title}`);
  }

  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

  const userId = lookupUserId(email, remote);
  console.log(`Attaching to user ${userId} (${remote ? "remote" : "local"} D1)`);

  const starredAt = new Date().toISOString();
  let batches = 0;
  for (const group of chunk(stars, 40)) {
    d1Json(insertStarsSql(group, userId, starredAt), remote);
    batches += 1;
  }
  console.log(`Wrote ${stars.length} rows in ${batches} batch(es). Re-open the game signed in as ${email}.`);
}

main();
