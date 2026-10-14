import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import {
  deleteQuote,
  fetchMyQuotes,
  fetchPopularQuotesGlobal,
  putQuote,
} from "../api/src/quotes.js";
import { fetchPopularStarsGlobal, putStar } from "../api/src/stars.js";

type Mark = {
  table: "stars" | "quotes";
  title_id: string;
  line_index: number;
  player_id: string;
  weight: number;
};

function createDb() {
  const rows: Mark[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO quotes")) {
                const [titleId, lineIndex, playerId] = args as [string, number, string];
                if (
                  !rows.some(
                    (row) =>
                      row.table === "quotes" &&
                      row.title_id === titleId &&
                      row.line_index === lineIndex &&
                      row.player_id === playerId,
                  )
                ) {
                  rows.push({
                    table: "quotes",
                    title_id: titleId,
                    line_index: lineIndex,
                    player_id: playerId,
                    weight: 1,
                  });
                }
              } else if (sql.includes("DELETE FROM quotes")) {
                const [titleId, lineIndex, playerId] = args as [string, number, string];
                const index = rows.findIndex(
                  (row) =>
                    row.table === "quotes" &&
                    row.title_id === titleId &&
                    row.line_index === lineIndex &&
                    row.player_id === playerId,
                );
                if (index >= 0) rows.splice(index, 1);
              } else if (sql.includes("INSERT INTO stars")) {
                const [titleId, lineIndex, playerId] = args as [string, number, string];
                rows.push({
                  table: "stars",
                  title_id: titleId,
                  line_index: lineIndex,
                  player_id: playerId,
                  weight: 1,
                });
              }
              return { meta: { changes: 1 } };
            },
            async all<T>() {
              if (sql.includes("FROM quotes") && sql.includes("COUNT(*)")) {
                const counts = new Map<string, { title_id: string; line_index: number; count: number }>();
                for (const row of rows.filter((item) => item.table === "quotes")) {
                  const key = `${row.title_id}:${row.line_index}`;
                  const existing = counts.get(key);
                  if (existing) existing.count += 1;
                  else counts.set(key, { title_id: row.title_id, line_index: row.line_index, count: 1 });
                }
                return { results: [...counts.values()] as T[] };
              }
              if (sql.includes("FROM quotes") && sql.includes("player_id")) {
                const playerId = args[0] as string;
                const titleId = sql.includes("title_id = ?") ? (args[1] as string) : null;
                return {
                  results: rows
                    .filter(
                      (row) =>
                        row.table === "quotes" &&
                        row.player_id === playerId &&
                        (titleId == null || row.title_id === titleId),
                    )
                    .map((row) => ({
                      title_id: row.title_id,
                      line_index: row.line_index,
                      quoted_at: "2026-10-14T00:00:00.000Z",
                    })) as T[],
                };
              }
              if (sql.includes("FROM stars") && sql.includes("SUM(weight)")) {
                const counts = new Map<string, { title_id: string; line_index: number; count: number }>();
                for (const row of rows.filter((item) => item.table === "stars")) {
                  const key = `${row.title_id}:${row.line_index}`;
                  const existing = counts.get(key);
                  if (existing) existing.count += row.weight;
                  else {
                    counts.set(key, {
                      title_id: row.title_id,
                      line_index: row.line_index,
                      count: row.weight,
                    });
                  }
                }
                return { results: [...counts.values()] as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, rows };
}

describe("quotes", () => {
  it("stores a quote without adding it to the star pool", async () => {
    const { db, rows } = createDb();
    await putStar(db, "player-1", { titleId: "film", lineIndex: 2 });
    await putQuote(db, "player-1", "film", 8);
    await putQuote(db, "player-2", "film", 8);

    const mine = await fetchMyQuotes(db, "player-1");
    expect(mine.map((quote) => quote.lineIndex)).toEqual([8]);

    const popularQuotes = await fetchPopularQuotesGlobal(db, 10);
    expect(popularQuotes).toEqual([{ titleId: "film", lineIndex: 8, count: 2 }]);

    const popularStars = await fetchPopularStarsGlobal(db, 10);
    expect(popularStars).toEqual([{ titleId: "film", lineIndex: 2, count: 1 }]);
    expect(rows.filter((row) => row.table === "stars")).toHaveLength(1);

    await deleteQuote(db, "player-1", "film", 8);
    expect(await fetchMyQuotes(db, "player-1")).toEqual([]);
    expect((await fetchPopularQuotesGlobal(db, 10))[0]?.count).toBe(1);
  });

  it("requires a signed-in session to mark a quote", async () => {
    const response = await handleRequest(
      new Request("http://api.test/api/quotes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titleId: "film", lineIndex: 1 }),
      }),
      { DB: {} as D1Database, ALLOWED_ORIGINS: "http://localhost:5173" },
    );
    expect(response.status).toBe(401);
  });
});
