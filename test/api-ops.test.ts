import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import { isExpired } from "../api/src/crypto.js";
import { OWNER_EMAIL } from "../src/lib/content/owner.js";

const OWNER_ID = "owner-1";
const OTHER_ID = "other-1";
const OWNER_SESSION = "owner-session";
const OTHER_SESSION = "other-session";

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type SessionRow = { id: string; user_id: string; expires_at: string };
type StarRow = { title_id: string; line_index: number; player_id: string };
type RunRow = { title_id: string };

function futureIso() {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function createOpsDb() {
  const users: UserRow[] = [
    { id: OWNER_ID, email: OWNER_EMAIL, display_name: "Das", created_at: new Date().toISOString() },
    { id: OTHER_ID, email: "friend@gmail.com", display_name: "Friend", created_at: new Date().toISOString() },
  ];
  const sessions: SessionRow[] = [
    { id: OWNER_SESSION, user_id: OWNER_ID, expires_at: futureIso() },
    { id: OTHER_SESSION, user_id: OTHER_ID, expires_at: futureIso() },
  ];
  const stars: StarRow[] = [
    { title_id: "oceans-thirteen-2007", line_index: 1, player_id: OWNER_ID },
    { title_id: "oceans-thirteen-2007", line_index: 2, player_id: OWNER_ID },
    { title_id: "oceans-thirteen-2007", line_index: 1, player_id: OTHER_ID },
  ];
  const runs: RunRow[] = [
    { title_id: "oceans-thirteen-2007" },
    { title_id: "oceans-thirteen-2007" },
    { title_id: "payback-1999" },
  ];

  const db = {
    prepare(sql: string) {
      const exec = (args: unknown[]) => ({
        bind(...next: unknown[]) {
          return exec(next);
        },
        async run() {
          return { success: true };
        },
        async first() {
          if (sql.includes("FROM sessions s") && sql.includes("JOIN users u")) {
            const [sessionId] = args as [string];
            const session = sessions.find((row) => row.id === sessionId);
            if (!session) return null;
            const user = users.find((row) => row.id === session.user_id);
            if (!user) return null;
            if (isExpired(session.expires_at)) return null;
            return {
              session_id: session.id,
              session_expires: session.expires_at,
              id: user.id,
              email: user.email,
              display_name: user.display_name,
              created_at: user.created_at,
            };
          }
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM stars WHERE player_id") && sql.includes("GROUP BY title_id")) {
            const [playerId] = args as [string];
            const counts = new Map<string, number>();
            for (const row of stars.filter((entry) => entry.player_id === playerId)) {
              counts.set(row.title_id, (counts.get(row.title_id) ?? 0) + 1);
            }
            const results = [...counts.entries()].map(([title_id, star_count]) => ({
              title_id,
              star_count,
            }));
            return { results: results as T[] };
          }
          if (sql.includes("FROM runs") && sql.includes("GROUP BY title_id")) {
            const counts = new Map<string, number>();
            for (const row of runs) {
              counts.set(row.title_id, (counts.get(row.title_id) ?? 0) + 1);
            }
            const results = [...counts.entries()].map(([title_id, play_count]) => ({
              title_id,
              play_count,
            }));
            return { results: results as T[] };
          }
          return { results: [] as T[] };
        },
      });
      return exec([]);
    },
  } as unknown as D1Database;

  return { db };
}

const origin = { Origin: "http://localhost:5173" };

describe("ops catalog HTTP", () => {
  it("rejects other signed-in users", async () => {
    const { db } = createOpsDb();
    const response = await handleRequest(
      new Request("http://localhost/api/ops/catalog", {
        headers: { ...origin, Authorization: `Bearer ${OTHER_SESSION}` },
      }),
      { DB: db, ALLOWED_ORIGINS: "http://localhost:5173" },
    );
    expect(response.status).toBe(403);
  });

  it("returns owner star counts and global plays", async () => {
    const { db } = createOpsDb();
    const response = await handleRequest(
      new Request("http://localhost/api/ops/catalog", {
        headers: { ...origin, Authorization: `Bearer ${OWNER_SESSION}` },
      }),
      { DB: db, ALLOWED_ORIGINS: "http://localhost:5173" },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      titles: [
        { titleId: "oceans-thirteen-2007", starCount: 2, playCount: 2 },
        { titleId: "payback-1999", starCount: 0, playCount: 1 },
      ],
    });
  });
});
