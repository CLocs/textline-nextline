import { describe, expect, it } from "vitest";
import { isAllowedOrigin, parseAllowedOrigins } from "../api/src/cors.js";
import {
  deleteStar,
  fetchMyStars,
  fetchPopularStars,
  fetchPopularStarsGlobal,
  isValidPlayerId,
  parseLoveBody,
  parseStarBody,
  putStar,
  setLoved,
} from "../api/src/stars.js";
import { handleRequest } from "../api/src/index.js";

const PLAYER_ID = "550e8400-e29b-41d4-a716-446655440000";

type Row = {
  title_id: string;
  line_index: number;
  player_id: string;
  starred_at: string;
  loved: number;
};

function createMockDb(initial: Row[] = []) {
  const rows = [...initial];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO stars")) {
                const [titleId, lineIndex, playerId, starredAt] = args as [
                  string,
                  number,
                  string,
                  string,
                ];
                const existing = rows.findIndex(
                  (row) =>
                    row.title_id === titleId &&
                    row.line_index === lineIndex &&
                    row.player_id === playerId,
                );
                if (existing !== -1) {
                  rows[existing]!.starred_at = starredAt;
                } else {
                  rows.push({
                    title_id: titleId,
                    line_index: lineIndex,
                    player_id: playerId,
                    starred_at: starredAt,
                    loved: 0,
                  });
                }
              } else if (sql.includes("UPDATE stars SET loved")) {
                const [loved, titleId, lineIndex, playerId] = args as [
                  number,
                  string,
                  number,
                  string,
                ];
                const row = rows.find(
                  (r) =>
                    r.title_id === titleId &&
                    r.line_index === lineIndex &&
                    r.player_id === playerId,
                );
                if (row) row.loved = loved;
              } else if (sql.includes("DELETE FROM stars")) {
                const [titleId, lineIndex, playerId] = args as [string, number, string];
                const index = rows.findIndex(
                  (row) =>
                    row.title_id === titleId &&
                    row.line_index === lineIndex &&
                    row.player_id === playerId,
                );
                if (index !== -1) rows.splice(index, 1);
              }
              return { success: true };
            },
            async first<T>() {
              if (sql.includes("SELECT loved FROM stars")) {
                const [titleId, lineIndex, playerId] = args as [string, number, string];
                const row = rows.find(
                  (r) =>
                    r.title_id === titleId &&
                    r.line_index === lineIndex &&
                    r.player_id === playerId,
                );
                return (row ? { loved: row.loved } : null) as T | null;
              }
              if (sql.includes("SELECT COUNT(*) AS n FROM stars")) {
                const [titleId, playerId] = args as [string, string];
                const n = rows.filter(
                  (r) => r.title_id === titleId && r.player_id === playerId && r.loved === 1,
                ).length;
                return { n } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("SELECT line_index, loved FROM stars") && sql.includes("player_id")) {
                const [titleId, playerId] = args as [string, string];
                const results = rows
                  .filter((row) => row.title_id === titleId && row.player_id === playerId)
                  .map((row) => ({ line_index: row.line_index, loved: row.loved }))
                  .sort((a, b) => a.line_index - b.line_index);
                return { results: results as T[] };
              }

              if (sql.includes("GROUP BY title_id, line_index")) {
                const [limit] = args as [number];
                const counts = new Map<string, { title_id: string; line_index: number; count: number }>();
                for (const row of rows) {
                  const key = `${row.title_id}:${row.line_index}`;
                  const existing = counts.get(key);
                  if (existing) existing.count += 1;
                  else {
                    counts.set(key, {
                      title_id: row.title_id,
                      line_index: row.line_index,
                      count: 1,
                    });
                  }
                }
                const results = [...counts.values()]
                  .sort(
                    (a, b) =>
                      b.count - a.count ||
                      a.title_id.localeCompare(b.title_id) ||
                      a.line_index - b.line_index,
                  )
                  .slice(0, limit);
                return { results: results as T[] };
              }

              if (sql.includes("GROUP BY line_index")) {
                const [titleId, limit] = args as [string, number];
                const counts = new Map<number, number>();
                for (const row of rows.filter((entry) => entry.title_id === titleId)) {
                  counts.set(row.line_index, (counts.get(row.line_index) ?? 0) + 1);
                }
                const results = [...counts.entries()]
                  .map(([line_index, count]) => ({ line_index, count }))
                  .sort((a, b) => b.count - a.count || a.line_index - b.line_index)
                  .slice(0, limit);
                return { results: results as T[] };
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

describe("star helpers", () => {
  it("validates player ids", () => {
    expect(isValidPlayerId(PLAYER_ID)).toBe(true);
    expect(isValidPlayerId("not-a-uuid")).toBe(false);
    expect(isValidPlayerId(null)).toBe(false);
  });

  it("parses star bodies", () => {
    expect(parseStarBody({ titleId: "ep-1", lineIndex: 3 })).toEqual({
      titleId: "ep-1",
      lineIndex: 3,
    });
    expect(parseStarBody({ titleId: "", lineIndex: 1 })).toBeNull();
    expect(parseStarBody({ titleId: "ep", lineIndex: 1.5 })).toBeNull();
    expect(parseLoveBody({ titleId: "ep", lineIndex: 1, loved: true })).toEqual({
      titleId: "ep",
      lineIndex: 1,
      loved: true,
    });
    expect(parseLoveBody({ titleId: "ep", lineIndex: 1 })).toBeNull();
  });

  it("stores and removes stars", async () => {
    const { db } = createMockDb();
    await putStar(db, PLAYER_ID, { titleId: "ep", lineIndex: 2 });
    expect(await fetchMyStars(db, PLAYER_ID, "ep")).toEqual([{ lineIndex: 2, loved: false }]);
    await deleteStar(db, PLAYER_ID, { titleId: "ep", lineIndex: 2 });
    expect(await fetchMyStars(db, PLAYER_ID, "ep")).toEqual([]);
  });

  it("loves a starred line and caps at five", async () => {
    const { db } = createMockDb();
    for (let i = 0; i < 5; i += 1) {
      await putStar(db, PLAYER_ID, { titleId: "ep", lineIndex: i });
      const ok = await setLoved(db, PLAYER_ID, { titleId: "ep", lineIndex: i, loved: true });
      expect(ok).toEqual({ ok: true });
    }
    await putStar(db, PLAYER_ID, { titleId: "ep", lineIndex: 5 });
    const capped = await setLoved(db, PLAYER_ID, { titleId: "ep", lineIndex: 5, loved: true });
    expect(capped).toMatchObject({ status: 400 });
  });

  it("aggregates popular stars by distinct players", async () => {
    const { db } = createMockDb();
    const otherPlayer = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    await putStar(db, PLAYER_ID, { titleId: "ep", lineIndex: 5 });
    await putStar(db, otherPlayer, { titleId: "ep", lineIndex: 5 });
    await putStar(db, PLAYER_ID, { titleId: "ep", lineIndex: 7 });

    expect(await fetchPopularStars(db, "ep", 10)).toEqual([
      { lineIndex: 5, count: 2 },
      { lineIndex: 7, count: 1 },
    ]);
  });

  it("aggregates popular stars across titles", async () => {
    const { db } = createMockDb();
    const otherPlayer = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";
    await putStar(db, PLAYER_ID, { titleId: "movie-a", lineIndex: 1 });
    await putStar(db, otherPlayer, { titleId: "movie-a", lineIndex: 1 });
    await putStar(db, PLAYER_ID, { titleId: "movie-b", lineIndex: 3 });

    expect(await fetchPopularStarsGlobal(db, 10)).toEqual([
      { titleId: "movie-a", lineIndex: 1, count: 2 },
      { titleId: "movie-b", lineIndex: 3, count: 1 },
    ]);
  });
});

describe("cors", () => {
  it("allows preview pages hosts", () => {
    const allowed = parseAllowedOrigins("https://textline-nextline.pages.dev");
    expect(isAllowedOrigin("https://init-202608.textline-nextline.pages.dev", allowed)).toBe(true);
    expect(isAllowedOrigin("https://evil.example.com", allowed)).toBe(false);
  });
});

describe("handleRequest", () => {
  it("stars and unstars via API", async () => {
    const { db } = createMockDb();
    const env = { DB: db, ALLOWED_ORIGINS: "http://localhost:5173" };

    const put = await handleRequest(
      new Request("http://localhost/api/stars", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Player-Id": PLAYER_ID,
          Origin: "http://localhost:5173",
        },
        body: JSON.stringify({ titleId: "ep", lineIndex: 4 }),
      }),
      env,
    );
    expect(put.status).toBe(200);

    const mine = await handleRequest(
      new Request("http://localhost/api/stars/mine?titleId=ep", {
        headers: {
          "X-Player-Id": PLAYER_ID,
          Origin: "http://localhost:5173",
        },
      }),
      env,
    );
    expect(await mine.json()).toEqual({
      stars: [{ lineIndex: 4, loved: false }],
      lineIndices: [4],
      lovedIndices: [],
    });

    const del = await handleRequest(
      new Request("http://localhost/api/stars", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Player-Id": PLAYER_ID,
          Origin: "http://localhost:5173",
        },
        body: JSON.stringify({ titleId: "ep", lineIndex: 4 }),
      }),
      env,
    );
    expect(del.status).toBe(200);
  });

  it("returns popular stars", async () => {
    const { db } = createMockDb();
    const env = { DB: db, ALLOWED_ORIGINS: "http://localhost:5173" };
    await putStar(db, PLAYER_ID, { titleId: "ep", lineIndex: 1 });

    const response = await handleRequest(
      new Request("http://localhost/api/stars/popular?titleId=ep&limit=5", {
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );

    expect(await response.json()).toEqual({
      popular: [{ lineIndex: 1, count: 1 }],
    });
  });

  it("returns global popular stars", async () => {
    const { db } = createMockDb();
    const env = { DB: db, ALLOWED_ORIGINS: "http://localhost:5173" };
    await putStar(db, PLAYER_ID, { titleId: "movie-a", lineIndex: 2 });

    const response = await handleRequest(
      new Request("http://localhost/api/stars/popular-global?limit=5", {
        headers: { Origin: "http://localhost:5173" },
      }),
      env,
    );

    expect(await response.json()).toEqual({
      popular: [{ titleId: "movie-a", lineIndex: 2, count: 1 }],
    });
  });
});
