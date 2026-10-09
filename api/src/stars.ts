export type StarBody = {
  titleId: string;
  lineIndex: number;
};

export type StarOrigin = "mine" | "wikiquote";

export type MyStar = {
  lineIndex: number;
  loved: boolean;
  origin: StarOrigin;
};

export type PopularStar = {
  lineIndex: number;
  count: number;
};

export const MAX_LOVED_PER_TITLE = 5;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPlayerId(playerId: string | null): playerId is string {
  return typeof playerId === "string" && UUID_RE.test(playerId);
}

export function parseStarBody(body: unknown): StarBody | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const titleId = record.titleId;
  const lineIndex = record.lineIndex;
  if (typeof titleId !== "string" || !titleId.trim()) return null;
  if (typeof lineIndex !== "number" || !Number.isInteger(lineIndex) || lineIndex < 0) return null;
  return { titleId: titleId.trim(), lineIndex };
}

export function parseLoveBody(body: unknown): (StarBody & { loved: boolean }) | null {
  const base = parseStarBody(body);
  if (!base || !body || typeof body !== "object") return null;
  const loved = (body as Record<string, unknown>).loved;
  if (typeof loved !== "boolean") return null;
  return { ...base, loved };
}

export async function putStar(db: D1Database, playerId: string, body: StarBody): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stars (title_id, line_index, player_id, starred_at, loved)
       VALUES (?, ?, ?, ?, 0)
       ON CONFLICT(title_id, line_index, player_id) DO UPDATE SET starred_at = excluded.starred_at`,
    )
    .bind(body.titleId, body.lineIndex, playerId, new Date().toISOString())
    .run();
}

/** Add or remove one point on this person's existing stars. Missing stars stay missing. Weight never drops below 1. */
export async function adjustStarWeights(
  db: D1Database,
  playerId: string,
  titleId: string,
  lineIndexes: readonly number[],
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const unique = [...new Set(lineIndexes)];
  for (const lineIndex of unique) {
    await db
      .prepare(
        `UPDATE stars SET weight = MAX(1, weight + ?)
         WHERE title_id = ? AND line_index = ? AND player_id = ?`,
      )
      .bind(delta, titleId, lineIndex, playerId)
      .run();
  }
}

export async function deleteStar(db: D1Database, playerId: string, body: StarBody): Promise<void> {
  await db
    .prepare(
      `DELETE FROM stars WHERE title_id = ? AND line_index = ? AND player_id = ?`,
    )
    .bind(body.titleId, body.lineIndex, playerId)
    .run();
}

export async function setLoved(
  db: D1Database,
  playerId: string,
  body: StarBody & { loved: boolean },
): Promise<{ ok: true } | { error: string; status: number }> {
  const existing = await db
    .prepare(
      `SELECT loved FROM stars WHERE title_id = ? AND line_index = ? AND player_id = ?`,
    )
    .bind(body.titleId, body.lineIndex, playerId)
    .first<{ loved: number }>();

  if (!existing) {
    return { error: "Star this line before loving it", status: 400 };
  }

  if (body.loved) {
    const countRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM stars
         WHERE title_id = ? AND player_id = ? AND loved = 1`,
      )
      .bind(body.titleId, playerId)
      .first<{ n: number }>();
    const n = Number(countRow?.n) || 0;
    const alreadyLoved = Number(existing.loved) === 1;
    if (!alreadyLoved && n >= MAX_LOVED_PER_TITLE) {
      return {
        error: `Love at most ${MAX_LOVED_PER_TITLE} lines per title`,
        status: 400,
      };
    }
  }

  const lovedFlag = body.loved ? 1 : 0;
  await db
    .prepare(
      `UPDATE stars SET loved = ?, origin = CASE WHEN ? = 1 THEN 'mine' ELSE origin END
       WHERE title_id = ? AND line_index = ? AND player_id = ?`,
    )
    .bind(lovedFlag, lovedFlag, body.titleId, body.lineIndex, playerId)
    .run();

  return { ok: true };
}

export async function fetchMyStars(
  db: D1Database,
  playerId: string,
  titleId: string,
): Promise<MyStar[]> {
  const result = await db
    .prepare(
      `SELECT line_index, loved, origin FROM stars
       WHERE title_id = ? AND player_id = ?
       ORDER BY line_index ASC`,
    )
    .bind(titleId, playerId)
    .all<{ line_index: number; loved: number; origin: string | null }>();

  return (result.results ?? []).map((row) => ({
    lineIndex: row.line_index,
    loved: Number(row.loved) === 1,
    origin: row.origin === "wikiquote" ? "wikiquote" : "mine",
  }));
}

export async function fetchPopularStars(
  db: D1Database,
  titleId: string,
  limit: number,
): Promise<PopularStar[]> {
  const result = await db
    .prepare(
      `SELECT line_index, SUM(weight) AS count
       FROM stars WHERE title_id = ?
       GROUP BY line_index
       ORDER BY count DESC, line_index ASC
       LIMIT ?`,
    )
    .bind(titleId, limit)
    .all<{ line_index: number; count: number }>();

  return (result.results ?? []).map((row) => ({
    lineIndex: row.line_index,
    count: row.count,
  }));
}

export type GlobalPopularStar = {
  titleId: string;
  lineIndex: number;
  count: number;
};

export async function fetchLovedStarsGlobal(
  db: D1Database,
  limit: number,
): Promise<{ titleId: string; lineIndex: number }[]> {
  const result = await db
    .prepare(
      `SELECT title_id, line_index
       FROM stars
       WHERE loved = 1
       GROUP BY title_id, line_index
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ title_id: string; line_index: number }>();

  return (result.results ?? []).map((row) => ({
    titleId: row.title_id,
    lineIndex: row.line_index,
  }));
}

export async function fetchPopularStarsGlobal(
  db: D1Database,
  limit: number,
): Promise<GlobalPopularStar[]> {
  const result = await db
    .prepare(
      `SELECT title_id, line_index, SUM(weight) AS count
       FROM stars
       GROUP BY title_id, line_index
       ORDER BY count DESC, title_id ASC, line_index ASC
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ title_id: string; line_index: number; count: number }>();

  return (result.results ?? []).map((row) => ({
    titleId: row.title_id,
    lineIndex: row.line_index,
    count: row.count,
  }));
}
