import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  chunk,
  countByTitle,
  excludeTitleIds,
  filterStarsByTitle,
  insertStarsSql,
  loadProtectedTitleIds,
  loadStarSeedFile,
  sqlString,
} from "../src/lib/content/starsPush.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const defaultSeed = join(packageRoot, "content", "stars-seed.json");
const defaultProtected = join(packageRoot, "content", "stars-protected.json");
const apiDir = join(packageRoot, "api");

function usage(): never {
  console.log(`Usage:
  npm run content:stars-push -- --email you@example.com [--remote] [--title payback-1999]

Inserts Readwise-matched lines from stars-seed.json into Cloudflare D1 as YOUR stars.
Does not delete or update existing rows (ON CONFLICT DO NOTHING).
Skips titles in content/stars-protected.json (curated — add an id when you
start curating a film) and any title that already has stars for you.
--force still honors the protected file. --dry-run --remote previews prod skips.

  --email     Required. Must already have signed in on the live app once.
  --remote    Read/write production D1 (textline-stars). Default is local wrangler D1.
  --title     Only this title id or name (e.g. payback-1999 or Payback).
  --exclude   Extra title id to skip (repeatable).
  --force     Also insert into titles that already have stars (not protected).
  --seed      Path to stars-seed.json
  --dry-run   Print skip/insert counts; do not write. Pair with --remote to query prod.
`);
  process.exit(1);
}

function parseArgs(argv: string[]): {
  email: string;
  remote: boolean;
  seed: string;
  dryRun: boolean;
  title: string;
  force: boolean;
  exclude: string[];
} {
  let email = "";
  let remote = false;
  let seed = defaultSeed;
  let dryRun = false;
  let title = "";
  let force = false;
  const exclude: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") email = argv[++i] ?? "";
    else if (arg === "--remote") remote = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--seed") seed = argv[++i] ?? seed;
    else if (arg === "--title") title = argv[++i] ?? "";
    else if (arg === "--exclude") exclude.push((argv[++i] ?? "").trim());
    else if (arg === "--force") force = true;
    else if (arg === "--help" || arg === "-h") usage();
  }
  if (!email.trim()) usage();
  return {
    email: email.trim(),
    remote,
    seed: resolve(seed),
    dryRun,
    title: title.trim(),
    force,
    exclude: exclude.filter(Boolean),
  };
}

function d1Json(command: string, remote: boolean): unknown {
  const wranglerJs = join(packageRoot, "node_modules", "wrangler", "bin", "wrangler.js");
  const args = [
    wranglerJs,
    "d1",
    "execute",
    "textline-stars",
    remote ? "--remote" : "--local",
    "--json",
    "--command",
    command,
  ];
  const raw = execFileSync(process.execPath, args, {
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

function existingTitleIds(playerId: string, remote: boolean): Set<string> {
  const payload = d1Json(
    `SELECT DISTINCT title_id FROM stars WHERE player_id = ${sqlString(playerId)};`,
    remote,
  );
  const ids = new Set<string>();
  for (const row of firstRows(payload)) {
    if (typeof row.title_id === "string" && row.title_id) ids.add(row.title_id);
  }
  return ids;
}

function printCounts(stars: ReturnType<typeof loadStarSeedFile>, label: string): void {
  console.log(`${stars.length} ${label}`);
  for (const [title, n] of [...countByTitle(stars).entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${n}\t${title}`);
  }
}

function starCountsForTitles(
  playerId: string,
  titleIds: string[],
  remote: boolean,
): Map<string, number> {
  const counts = new Map<string, number>();
  if (titleIds.length === 0) return counts;
  const list = titleIds.map(sqlString).join(", ");
  const payload = d1Json(
    `SELECT title_id, COUNT(*) AS n FROM stars WHERE player_id = ${sqlString(playerId)} AND title_id IN (${list}) GROUP BY title_id;`,
    remote,
  );
  for (const row of firstRows(payload)) {
    if (typeof row.title_id === "string") counts.set(row.title_id, Number(row.n) || 0);
  }
  return counts;
}

function main(): void {
  const { email, remote, seed, dryRun, title, force, exclude } = parseArgs(process.argv.slice(2));
  if (!existsSync(seed)) {
    console.error(`Seed not found: ${seed}`);
    process.exit(1);
  }

  let stars = loadStarSeedFile(seed);
  if (title) {
    stars = filterStarsByTitle(stars, title);
    if (stars.length === 0) {
      console.error(`No seed stars matched --title ${title}`);
      process.exit(1);
    }
  }
  printCounts(stars, title ? `seed stars for --title ${title}` : "seed stars");

  if (dryRun && !remote) {
    console.log("Dry run (seed file only). Pass --remote --dry-run to preview prod skips.");
    return;
  }

  const userId = lookupUserId(email, remote);
  console.log(`Attaching to user ${userId} (${remote ? "remote" : "local"} D1)`);

  const protectedIds = new Set(loadProtectedTitleIds(defaultProtected));
  const skipIds = new Set<string>(protectedIds);
  for (const id of exclude) skipIds.add(id);
  if (!force) {
    for (const id of existingTitleIds(userId, remote)) skipIds.add(id);
  }

  const skipped = [...new Set(stars.map((star) => star.titleId).filter((id) => skipIds.has(id)))];
  if (skipped.length) {
    const liveCounts = starCountsForTitles(userId, skipped, remote);
    console.log(`Leaving ${skipped.length} title(s) untouched:`);
    for (const id of skipped.sort()) {
      const n = liveCounts.get(id);
      const protectedMark = protectedIds.has(id) ? " (protected)" : "";
      const live = n != null ? ` — ${n} live star(s)` : "";
      console.log(`  ${id}${protectedMark}${live}`);
    }
    stars = excludeTitleIds(stars, skipIds);
  }

  if (stars.length === 0) {
    console.log(dryRun ? "Dry run — nothing would be inserted." : "Nothing to insert.");
    return;
  }

  printCounts(stars, dryRun ? "rows that would be inserted" : "rows to insert");
  if (dryRun) {
    console.log("Dry run — nothing written.");
    return;
  }

  const starredAt = new Date().toISOString();
  let batches = 0;
  for (const group of chunk(stars, 40)) {
    d1Json(insertStarsSql(group, userId, starredAt), remote);
    batches += 1;
  }
  console.log(`Wrote ${stars.length} rows in ${batches} batch(es). Re-open the game signed in as ${email}.`);
}

main();
