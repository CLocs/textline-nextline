/**
 * Idempotent ALTER TABLE ADD COLUMN helpers.
 * Plain `ADD COLUMN` is not IF NOT EXISTS, so re-running migration .sql fails in CI.
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const remote = process.argv.includes("--remote");

const ALTERS = [
  { table: "runs", column: "question_queue", sql: "ALTER TABLE runs ADD COLUMN question_queue TEXT" },
  {
    table: "mini_shares",
    column: "line_indices",
    sql: "ALTER TABLE mini_shares ADD COLUMN line_indices TEXT",
  },
  {
    table: "stars",
    column: "loved",
    sql: "ALTER TABLE stars ADD COLUMN loved INTEGER NOT NULL DEFAULT 0",
  },
  { table: "line_inbox", column: "read_at", sql: "ALTER TABLE line_inbox ADD COLUMN read_at TEXT" },
  { table: "line_inbox", column: "group_id", sql: "ALTER TABLE line_inbox ADD COLUMN group_id TEXT" },
  { table: "line_inbox", column: "solved_at", sql: "ALTER TABLE line_inbox ADD COLUMN solved_at TEXT" },
];

function wrangler(args) {
  const quoted = args.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg)).join(" ");
  return execSync(`npx wrangler ${quoted}`, {
    cwd: apiRoot,
    encoding: "utf8",
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function parseJson(raw) {
  const start = raw.indexOf("[");
  if (start === -1) throw new Error(`No JSON in wrangler output:\n${raw}`);
  return JSON.parse(raw.slice(start));
}

function columnNames(table) {
  const loc = remote ? "--remote" : "--local";
  const raw = wrangler([
    "d1",
    "execute",
    "textline-stars",
    loc,
    "--yes",
    "--json",
    "--command",
    `PRAGMA table_info(${table})`,
  ]);
  const payload = parseJson(raw);
  const rows = payload[0]?.results ?? payload[0]?.result ?? [];
  return new Set(rows.map((row) => String(row.name)));
}

for (const alter of ALTERS) {
  const existing = columnNames(alter.table);
  if (existing.has(alter.column)) {
    console.log(`skip ${alter.table}.${alter.column} (already present)`);
    continue;
  }
  console.log(`add ${alter.table}.${alter.column}`);
  const loc = remote ? "--remote" : "--local";
  wrangler(["d1", "execute", "textline-stars", loc, "--yes", "--command", alter.sql]);
}
