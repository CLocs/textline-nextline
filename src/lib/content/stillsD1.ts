import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { OWNER_EMAIL } from "./owner.js";
import { sqlString } from "./starsPush.js";

function parseD1Json(raw: string): unknown {
  const trimmed = raw.trim();
  const start = trimmed.search(/[\[{]/);
  if (start < 0) {
    throw new Error(`D1 output was not JSON: ${trimmed.slice(0, 240)}`);
  }
  return JSON.parse(trimmed.slice(start));
}

function d1Json(packageRoot: string, command: string, remote: boolean): unknown {
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
  try {
    const raw = execFileSync(process.execPath, args, {
      cwd: join(packageRoot, "api"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
    });
    return parseD1Json(raw);
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message: string };
    if (err.stdout) {
      try {
        return parseD1Json(err.stdout);
      } catch {
        /* fall through */
      }
    }
    throw new Error((err.stderr || err.message).slice(0, 800));
  }
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

export type OwnerStarMap = Record<string, number[]>;

/** Owner D1 stars keyed by title id. Remote first, then local. */
export function fetchOwnerStarMap(
  packageRoot: string,
  email = OWNER_EMAIL,
): { stars: OwnerStarMap; remote: boolean; error?: string } {
  const command = `SELECT s.title_id, s.line_index FROM stars s JOIN users u ON u.id = s.player_id WHERE lower(u.email) = lower(${sqlString(email)}) ORDER BY s.title_id, s.line_index;`;
  for (const remote of [true, false]) {
    try {
      const stars: OwnerStarMap = {};
      for (const row of firstRows(d1Json(packageRoot, command, remote))) {
        const titleId = row.title_id;
        const n = Number(row.line_index);
        if (typeof titleId !== "string" || !titleId) continue;
        if (!Number.isInteger(n) || n < 0) continue;
        const list = stars[titleId] ?? [];
        list.push(n);
        stars[titleId] = list;
      }
      return { stars, remote };
    } catch (error) {
      if (!remote) {
        return {
          stars: {},
          remote: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }
  return { stars: {}, remote: false, error: "D1 star lookup failed." };
}

export function starCountsFromMap(stars: OwnerStarMap): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [titleId, indices] of Object.entries(stars)) {
    counts[titleId] = indices.length;
  }
  return counts;
}
