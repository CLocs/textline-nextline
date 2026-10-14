export type QuoteOrigin = "mine" | "wikiquote";

export type QuoteRow = {
  titleId: string;
  lineIndex: number;
  quotedAt: string;
  origin: QuoteOrigin;
};

export type PopularQuote = {
  titleId: string;
  lineIndex: number;
  count: number;
};

type QuoteDbRow = {
  title_id: string;
  line_index: number;
  quoted_at: string;
  origin: string | null;
};

type PopularQuoteDbRow = {
  title_id: string;
  line_index: number;
  count: number;
};

function mapQuote(row: QuoteDbRow): QuoteRow {
  return {
    titleId: row.title_id,
    lineIndex: row.line_index,
    quotedAt: row.quoted_at,
    origin: row.origin === "wikiquote" ? "wikiquote" : "mine",
  };
}

export async function putQuote(
  db: D1Database,
  playerId: string,
  titleId: string,
  lineIndex: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO quotes (title_id, line_index, player_id, quoted_at, origin)
       VALUES (?, ?, ?, ?, 'mine')
       ON CONFLICT(title_id, line_index, player_id) DO UPDATE SET quoted_at = excluded.quoted_at`,
    )
    .bind(titleId, lineIndex, playerId, new Date().toISOString())
    .run();
}

export async function deleteQuote(
  db: D1Database,
  playerId: string,
  titleId: string,
  lineIndex: number,
): Promise<void> {
  await db
    .prepare(`DELETE FROM quotes WHERE title_id = ? AND line_index = ? AND player_id = ?`)
    .bind(titleId, lineIndex, playerId)
    .run();
}

export async function fetchMyQuotes(
  db: D1Database,
  playerId: string,
  titleId?: string | null,
): Promise<QuoteRow[]> {
  const query = titleId
    ? db
        .prepare(
          `SELECT title_id, line_index, quoted_at, origin FROM quotes
           WHERE player_id = ? AND title_id = ?
           ORDER BY line_index ASC`,
        )
        .bind(playerId, titleId)
    : db
        .prepare(
          `SELECT title_id, line_index, quoted_at, origin FROM quotes
           WHERE player_id = ?
           ORDER BY title_id ASC, line_index ASC`,
        )
        .bind(playerId);
  const result = await query.all<QuoteDbRow>();
  return (result.results ?? []).map(mapQuote);
}

/** How many people marked each line. This is not a star count. */
export async function fetchPopularQuotesGlobal(
  db: D1Database,
  limit: number,
): Promise<PopularQuote[]> {
  const cap = Math.min(Math.max(Math.floor(limit), 1), 500);
  const result = await db
    .prepare(
      `SELECT title_id, line_index, COUNT(*) AS count
       FROM quotes
       GROUP BY title_id, line_index
       ORDER BY count DESC, title_id ASC, line_index ASC
       LIMIT ?`,
    )
    .bind(cap)
    .all<PopularQuoteDbRow>();
  return (result.results ?? []).map((row) => ({
    titleId: row.title_id,
    lineIndex: row.line_index,
    count: row.count,
  }));
}
