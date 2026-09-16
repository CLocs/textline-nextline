import { isOwnerEmail, OWNER_EMAIL } from "../../src/lib/content/owner.js";

export type TitleStat = {
  titleId: string;
  starCount: number;
  playCount: number;
};

export { isOwnerEmail, OWNER_EMAIL };

export async function fetchOwnerCatalogStats(
  db: D1Database,
  playerId: string,
): Promise<TitleStat[]> {
  const stars = await db
    .prepare(
      `SELECT title_id, COUNT(*) AS star_count
       FROM stars WHERE player_id = ?
       GROUP BY title_id`,
    )
    .bind(playerId)
    .all<{ title_id: string; star_count: number }>();

  const plays = await db
    .prepare(
      `SELECT title_id, COUNT(*) AS play_count
       FROM runs
       GROUP BY title_id`,
    )
    .all<{ title_id: string; play_count: number }>();

  const byId = new Map<string, TitleStat>();
  for (const row of stars.results ?? []) {
    byId.set(row.title_id, {
      titleId: row.title_id,
      starCount: Number(row.star_count) || 0,
      playCount: 0,
    });
  }
  for (const row of plays.results ?? []) {
    const existing = byId.get(row.title_id) ?? {
      titleId: row.title_id,
      starCount: 0,
      playCount: 0,
    };
    existing.playCount = Number(row.play_count) || 0;
    byId.set(row.title_id, existing);
  }

  return [...byId.values()].sort((a, b) => a.titleId.localeCompare(b.titleId));
}
