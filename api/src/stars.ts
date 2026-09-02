export type StarBody = {
  titleId: string;
  lineIndex: number;
};

export type PopularStar = {
  lineIndex: number;
  count: number;
};

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

export async function putStar(db: D1Database, playerId: string, body: StarBody): Promise<void> {
  await db
    .prepare(
      `INSERT INTO stars (title_id, line_index, player_id, starred_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(title_id, line_index, player_id) DO UPDATE SET starred_at = excluded.starred_at`,
    )
    .bind(body.titleId, body.lineIndex, playerId, new Date().toISOString())
    .run();
}

export async function deleteStar(db: D1Database, playerId: string, body: StarBody): Promise<void> {
  await db
    .prepare(
      `DELETE FROM stars WHERE title_id = ? AND line_index = ? AND player_id = ?`,
    )
    .bind(body.titleId, body.lineIndex, playerId)
    .run();
}

export async function fetchMyStars(
  db: D1Database,
  playerId: string,
  titleId: string,
): Promise<number[]> {
  const result = await db
    .prepare(
      `SELECT line_index FROM stars
       WHERE title_id = ? AND player_id = ?
       ORDER BY line_index ASC`,
    )
    .bind(titleId, playerId)
    .all<{ line_index: number }>();

  return (result.results ?? []).map((row) => row.line_index);
}

export async function fetchPopularStars(
  db: D1Database,
  titleId: string,
  limit: number,
): Promise<PopularStar[]> {
  const result = await db
    .prepare(
      `SELECT line_index, COUNT(*) AS count
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
