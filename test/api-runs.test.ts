import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import { parseRunBody } from "../api/src/runs.js";

const RUN_ID = "550e8400-e29b-41d4-a716-446655440001";
const RUN_ID_B = "550e8400-e29b-41d4-a716-446655440002";
const USER_ID = "user-1";
const OTHER_USER = "user-2";
const SESSION = "session-1";
const OTHER_SESSION = "session-2";

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type SessionRow = { id: string; user_id: string; expires_at: string };
type GameRunRow = {
  id: string;
  user_id: string;
  title_id: string;
  length: string;
  mode: string;
  correct_count: number;
  wrong_count: number;
  skip_count: number;
  question_total: number;
  end_reason: string;
  share_id: string | null;
  completed_at: string;
};
type RatingRow = { run_id: string; thumb: string; rated_at: string };

function futureIso() {
  return new Date(Date.now() + 86_400_000).toISOString();
}

function createRunsDb() {
  const users: UserRow[] = [
    {
      id: USER_ID,
      email: "sam@example.com",
      display_name: "Sam",
      created_at: new Date().toISOString(),
    },
    {
      id: OTHER_USER,
      email: "pat@example.com",
      display_name: "Pat",
      created_at: new Date().toISOString(),
    },
  ];
  const sessions: SessionRow[] = [
    { id: SESSION, user_id: USER_ID, expires_at: futureIso() },
    { id: OTHER_SESSION, user_id: OTHER_USER, expires_at: futureIso() },
  ];
  const runs: GameRunRow[] = [];
  const ratings: RatingRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO runs")) {
                const [
                  id,
                  userId,
                  titleId,
                  length,
                  mode,
                  correct,
                  wrong,
                  skip,
                  total,
                  endReason,
                  shareId,
                  completedAt,
                ] = args as [
                  string,
                  string,
                  string,
                  string,
                  string,
                  number,
                  number,
                  number,
                  number,
                  string,
                  string | null,
                  string,
                ];
                if (runs.some((row) => row.id === id)) return { success: true };
                runs.push({
                  id,
                  user_id: userId,
                  title_id: titleId,
                  length,
                  mode,
                  correct_count: correct,
                  wrong_count: wrong,
                  skip_count: skip,
                  question_total: total,
                  end_reason: endReason,
                  share_id: shareId,
                  completed_at: completedAt,
                });
              } else if (sql.includes("INSERT INTO run_ratings")) {
                const [runId, thumb, ratedAt] = args as [string, string, string];
                const existing = ratings.findIndex((row) => row.run_id === runId);
                const next = { run_id: runId, thumb, rated_at: ratedAt };
                if (existing === -1) ratings.push(next);
                else ratings[existing] = next;
              }
              return { success: true };
            },
            async first<T>() {
              if (sql.includes("FROM sessions s") && sql.includes("JOIN users")) {
                const [sessionId] = args as [string];
                const session = sessions.find((s) => s.id === sessionId);
                if (!session) return null;
                const user = users.find((u) => u.id === session.user_id);
                if (!user) return null;
                return {
                  session_id: session.id,
                  session_expires: session.expires_at,
                  id: user.id,
                  email: user.email,
                  display_name: user.display_name,
                  created_at: user.created_at,
                } as T;
              }
              if (sql.includes("SELECT id, user_id FROM runs WHERE id")) {
                const [runId] = args as [string];
                const row = runs.find((r) => r.id === runId);
                return (row ? { id: row.id, user_id: row.user_id } : null) as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM runs r") && sql.includes("LEFT JOIN run_ratings")) {
                const [userId, limit] = args as [string, number];
                const results = runs
                  .filter((row) => row.user_id === userId)
                  .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
                  .slice(0, limit)
                  .map((row) => {
                    const rating = ratings.find((r) => r.run_id === row.id);
                    return {
                      id: row.id,
                      title_id: row.title_id,
                      length: row.length,
                      mode: row.mode,
                      correct_count: row.correct_count,
                      wrong_count: row.wrong_count,
                      skip_count: row.skip_count,
                      question_total: row.question_total,
                      end_reason: row.end_reason,
                      share_id: row.share_id,
                      completed_at: row.completed_at,
                      thumb: rating?.thumb ?? null,
                    };
                  });
                return { results: results as T[] };
              }
              if (sql.includes("GROUP BY title_id")) {
                const [limit] = args as [number];
                const counts = new Map<string, number>();
                for (const row of runs) {
                  counts.set(row.title_id, (counts.get(row.title_id) ?? 0) + 1);
                }
                const results = [...counts.entries()]
                  .map(([title_id, play_count]) => ({ title_id, play_count }))
                  .sort((a, b) => b.play_count - a.play_count || a.title_id.localeCompare(b.title_id))
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

  return { db, runs, ratings };
}

const validBody = {
  id: RUN_ID,
  titleId: "payback-1999",
  length: "mini" as const,
  mode: "fun" as const,
  correctCount: 8,
  wrongCount: 1,
  skipCount: 1,
  questionTotal: 10,
  endReason: "finished" as const,
};

function authed(path: string, init: RequestInit = {}, session = SESSION) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session}`);
  headers.set("Origin", "http://localhost:5173");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${path}`, { ...init, headers });
}

const envFor = (db: D1Database) => ({
  DB: db,
  ALLOWED_ORIGINS: "http://localhost:5173",
});

describe("parseRunBody", () => {
  it("accepts a complete run payload", () => {
    expect(parseRunBody(validBody)).toEqual({ ...validBody, shareId: null });
  });

  it("rejects a bad id", () => {
    expect(parseRunBody({ ...validBody, id: "nope" })).toBeNull();
  });
});

describe("runs HTTP", () => {
  it("rejects unauthenticated posts", async () => {
    const { db } = createRunsDb();
    const response = await handleRequest(
      new Request("http://localhost/api/runs", {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify(validBody),
      }),
      envFor(db),
    );
    expect(response.status).toBe(401);
  });

  it("inserts a run, ignores duplicate ids, and lists mine", async () => {
    const { db, runs } = createRunsDb();
    const first = await handleRequest(
      authed("/api/runs", { method: "POST", body: JSON.stringify(validBody) }),
      envFor(db),
    );
    expect(first.status).toBe(200);
    expect(runs).toHaveLength(1);

    const dup = await handleRequest(
      authed("/api/runs", {
        method: "POST",
        body: JSON.stringify({ ...validBody, correctCount: 0 }),
      }),
      envFor(db),
    );
    expect(dup.status).toBe(200);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.correct_count).toBe(8);

    await handleRequest(
      authed("/api/runs", {
        method: "POST",
        body: JSON.stringify({ ...validBody, id: RUN_ID_B, titleId: "snatch-2000" }),
      }),
      envFor(db),
    );

    const mine = await handleRequest(authed("/api/runs/mine"), envFor(db));
    expect(mine.status).toBe(200);
    const data = (await mine.json()) as { runs: { titleId: string }[] };
    expect(data.runs.map((row) => row.titleId)).toEqual(["snatch-2000", "payback-1999"]);
  });

  it("rates only the owner's run and aggregates played stats", async () => {
    const { db, ratings } = createRunsDb();
    await handleRequest(
      authed("/api/runs", { method: "POST", body: JSON.stringify(validBody) }),
      envFor(db),
    );
    await handleRequest(
      authed("/api/runs", {
        method: "POST",
        body: JSON.stringify({ ...validBody, id: RUN_ID_B, titleId: "payback-1999" }),
      }),
      envFor(db),
    );

    const stolen = await handleRequest(
      authed(
        `/api/runs/${RUN_ID}/rating`,
        { method: "PATCH", body: JSON.stringify({ thumb: "up" }) },
        OTHER_SESSION,
      ),
      envFor(db),
    );
    expect(stolen.status).toBe(404);

    const rated = await handleRequest(
      authed(`/api/runs/${RUN_ID}/rating`, {
        method: "PATCH",
        body: JSON.stringify({ thumb: "up" }),
      }),
      envFor(db),
    );
    expect(rated.status).toBe(200);
    expect(ratings[0]?.thumb).toBe("up");

    const stats = await handleRequest(authed("/api/stats/played"), envFor(db));
    expect(stats.status).toBe(200);
    const data = (await stats.json()) as { titles: { titleId: string; playCount: number }[] };
    expect(data.titles).toEqual([{ titleId: "payback-1999", playCount: 2 }]);
  });
});
