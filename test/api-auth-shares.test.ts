import { describe, expect, it, vi } from "vitest";
import {
  claimAnonymousStars,
  requestMagicLink,
  verifyMagicToken,
} from "../api/src/auth.js";
import { createFrozenShare, createShare, getShareQueue, listSharedRuns, upsertSharedRun } from "../api/src/shares.js";
import { putStar } from "../api/src/stars.js";
import { handleRequest } from "../api/src/index.js";
import { sha256Hex } from "../api/src/crypto.js";

type StarRow = {
  title_id: string;
  line_index: number;
  player_id: string;
  starred_at: string;
};

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type TokenRow = {
  token_hash: string;
  email: string;
  expires_at: string;
  consumed_at: string | null;
};
type SessionRow = { id: string; user_id: string; expires_at: string };
type ClaimRow = { anonymous_player_id: string; user_id: string; claimed_at: string };
type ShareRow = {
  id: string;
  owner_user_id: string;
  title_id: string;
  created_at: string;
  revoked_at: string | null;
  line_indices: string | null;
};
type RunRow = {
  id: string;
  share_id: string;
  player_user_id: string;
  correct_count: number;
  wrong_count: number;
  skip_count: number;
  completed_at: string;
};

function createRichMockDb() {
  const stars: StarRow[] = [];
  const users: UserRow[] = [];
  const tokens: TokenRow[] = [];
  const sessions: SessionRow[] = [];
  const claims: ClaimRow[] = [];
  const shares: ShareRow[] = [];
  const runs: RunRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO magic_tokens")) {
                const [tokenHash, email, expiresAt] = args as [string, string, string];
                tokens.push({
                  token_hash: tokenHash,
                  email,
                  expires_at: expiresAt,
                  consumed_at: null,
                });
              } else if (sql.includes("UPDATE magic_tokens SET consumed_at")) {
                const [consumedAt, tokenHash] = args as [string, string];
                const row = tokens.find((t) => t.token_hash === tokenHash);
                if (row) row.consumed_at = consumedAt;
              } else if (sql.includes("INSERT INTO users")) {
                const [id, email, displayName, createdAt] = args as [
                  string,
                  string,
                  string,
                  string,
                ];
                users.push({
                  id,
                  email,
                  display_name: displayName,
                  created_at: createdAt,
                });
              } else if (sql.includes("INSERT INTO sessions")) {
                const [id, userId, expiresAt] = args as [string, string, string];
                sessions.push({ id, user_id: userId, expires_at: expiresAt });
              } else if (sql.includes("DELETE FROM sessions")) {
                const [id] = args as [string];
                const index = sessions.findIndex((s) => s.id === id);
                if (index !== -1) sessions.splice(index, 1);
              } else if (sql.includes("INSERT INTO stars")) {
                const [titleId, lineIndex, playerId, starredAt] = args as [
                  string,
                  number,
                  string,
                  string,
                ];
                const existing = stars.findIndex(
                  (row) =>
                    row.title_id === titleId &&
                    row.line_index === lineIndex &&
                    row.player_id === playerId,
                );
                if (existing === -1) {
                  stars.push({
                    title_id: titleId,
                    line_index: lineIndex,
                    player_id: playerId,
                    starred_at: starredAt,
                  });
                }
              } else if (sql.includes("DELETE FROM stars WHERE player_id")) {
                const [playerId] = args as [string];
                for (let i = stars.length - 1; i >= 0; i -= 1) {
                  if (stars[i]!.player_id === playerId) stars.splice(i, 1);
                }
              } else if (sql.includes("INSERT INTO player_claims")) {
                const [anonymousId, userId, claimedAt] = args as [string, string, string];
                claims.push({
                  anonymous_player_id: anonymousId,
                  user_id: userId,
                  claimed_at: claimedAt,
                });
              } else if (sql.includes("INSERT INTO mini_shares")) {
                const [id, ownerUserId, titleId, createdAt, lineIndices] = args as [
                  string,
                  string,
                  string,
                  string,
                  string | undefined,
                ];
                shares.push({
                  id,
                  owner_user_id: ownerUserId,
                  title_id: titleId,
                  created_at: createdAt,
                  revoked_at: null,
                  line_indices: lineIndices ?? null,
                });
              } else if (sql.includes("INSERT INTO shared_runs")) {
                const [id, shareId, playerUserId, correct, wrong, skip, completedAt] = args as [
                  string,
                  string,
                  string,
                  number,
                  number,
                  number,
                  string,
                ];
                const existing = runs.findIndex(
                  (row) => row.share_id === shareId && row.player_user_id === playerUserId,
                );
                const next = {
                  id,
                  share_id: shareId,
                  player_user_id: playerUserId,
                  correct_count: correct,
                  wrong_count: wrong,
                  skip_count: skip,
                  completed_at: completedAt,
                };
                if (existing !== -1) runs[existing] = next;
                else runs.push(next);
              }
              return { success: true };
            },
            async first<T>() {
              if (sql.includes("FROM magic_tokens WHERE token_hash")) {
                const [tokenHash] = args as [string];
                return (tokens.find((t) => t.token_hash === tokenHash) as T) ?? null;
              }
              if (sql.includes("FROM magic_tokens") && sql.includes("email = ?")) {
                const [email] = args as [string];
                const matches = tokens
                  .filter((t) => t.email === email && !t.consumed_at)
                  .sort((a, b) => b.expires_at.localeCompare(a.expires_at));
                return (matches[0] as T) ?? null;
              }
              if (sql.includes("FROM users WHERE email")) {
                const [email] = args as [string];
                return (users.find((u) => u.email === email) as T) ?? null;
              }
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
              if (sql.includes("FROM player_claims")) {
                const [anonymousId] = args as [string];
                return (claims.find((c) => c.anonymous_player_id === anonymousId) as T) ?? null;
              }
              if (sql.includes("FROM mini_shares s") && sql.includes("JOIN users")) {
                const [shareId] = args as [string];
                const share = shares.find((s) => s.id === shareId);
                if (!share) return null;
                const user = users.find((u) => u.id === share.owner_user_id);
                if (!user) return null;
                const starCount = stars.filter(
                  (st) =>
                    st.player_id === share.owner_user_id && st.title_id === share.title_id,
                ).length;
                return {
                  id: share.id,
                  title_id: share.title_id,
                  created_at: share.created_at,
                  revoked_at: share.revoked_at,
                  email: user.email,
                  display_name: user.display_name,
                  star_count: starCount,
                } as T;
              }
              if (sql.includes("FROM mini_shares WHERE id")) {
                const [shareId] = args as [string];
                const share = shares.find((s) => s.id === shareId);
                if (!share) return null;
                return {
                  id: share.id,
                  title_id: share.title_id,
                  owner_user_id: share.owner_user_id,
                  revoked_at: share.revoked_at,
                  line_indices: share.line_indices,
                } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("SELECT title_id, line_index, starred_at FROM stars")) {
                const [playerId] = args as [string];
                return {
                  results: stars
                    .filter((row) => row.player_id === playerId)
                    .map((row) => ({
                      title_id: row.title_id,
                      line_index: row.line_index,
                      starred_at: row.starred_at,
                    })) as T[],
                };
              }
              if (sql.includes("SELECT line_index FROM stars")) {
                const [playerId, titleId] = args as [string, string];
                return {
                  results: stars
                    .filter((row) => row.player_id === playerId && row.title_id === titleId)
                    .map((row) => ({ line_index: row.line_index })) as T[],
                };
              }
              if (sql.includes("FROM shared_runs r")) {
                const [shareId] = args as [string];
                const results = runs
                  .filter((row) => row.share_id === shareId)
                  .map((row) => {
                    const user = users.find((u) => u.id === row.player_user_id)!;
                    return {
                      player_user_id: row.player_user_id,
                      correct_count: row.correct_count,
                      wrong_count: row.wrong_count,
                      skip_count: row.skip_count,
                      completed_at: row.completed_at,
                      email: user.email,
                      display_name: user.display_name,
                    };
                  })
                  .sort(
                    (a, b) =>
                      b.correct_count - a.correct_count ||
                      a.wrong_count - b.wrong_count ||
                      a.completed_at.localeCompare(b.completed_at),
                  );
                return { results: results as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, stars, users, tokens, sessions, shares, runs };
}

describe("auth helpers", () => {
  it("verifies magic token once and creates a session", async () => {
    const { db, tokens } = createRichMockDb();
    const env = { DB: db, APP_ORIGIN: "https://textlinenextline.com" };

    const requested = await requestMagicLink(env, "sam@example.com", {
      linkOrigin: "http://localhost:5173",
      allowedOrigins: ["http://localhost:5173", "https://textlinenextline.com"],
    });
    expect(requested).toEqual({ ok: true });
    expect(tokens).toHaveLength(1);

    // Recover raw token by brute-checking hashes is hard; insert a known token
    const raw = "a".repeat(64);
    tokens[0]!.token_hash = await sha256Hex(raw);
    tokens[0]!.expires_at = new Date(Date.now() + 60_000).toISOString();

    const first = await verifyMagicToken(db, raw);
    expect("sessionToken" in first).toBe(true);
    if ("error" in first) throw new Error(first.error);

    const second = await verifyMagicToken(db, raw);
    expect(second).toMatchObject({ error: "Link already used" });
  });

  it("builds magic links for the requesting origin when allowed", async () => {
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const { db } = createRichMockDb();
    const env = { DB: db, APP_ORIGIN: "https://textlinenextline.com" };

    await requestMagicLink(env, "dev@example.com", {
      linkOrigin: "http://localhost:5173",
      allowedOrigins: ["http://localhost:5173", "https://textlinenextline.com"],
    });

    expect(logs.some((line) => line.includes("http://localhost:5173/#/auth?token="))).toBe(true);
    spy.mockRestore();
  });

  it("claims anonymous stars onto the user", async () => {
    const { db } = createRichMockDb();
    const anon = "550e8400-e29b-41d4-a716-446655440000";
    await putStar(db, anon, { titleId: "ep", lineIndex: 3 });

    const claimed = await claimAnonymousStars(db, "user-1", anon);
    expect(claimed).toEqual({ claimed: 1 });

    const again = await claimAnonymousStars(db, "user-1", anon);
    expect(again).toEqual({ claimed: 0 });
  });
});

describe("shares", () => {
  it("builds a queue from owner stars and records runs", async () => {
    const { db, users } = createRichMockDb();
    users.push({
      id: "owner",
      email: "owner@example.com",
      display_name: "Owner",
      created_at: new Date().toISOString(),
    });
    users.push({
      id: "player",
      email: "player@example.com",
      display_name: "Player",
      created_at: new Date().toISOString(),
    });

    await putStar(db, "owner", { titleId: "ep", lineIndex: 5 });
    await putStar(db, "owner", { titleId: "ep", lineIndex: 9 });

    const share = await createShare(
      db,
      { id: "owner", email: "owner@example.com", displayName: "Owner", createdAt: "" },
      "ep",
    );
    const queue = await getShareQueue(db, share.id);
    expect(queue).toEqual({ titleId: "ep", lineIndices: [5, 9], frozen: false });

    await upsertSharedRun(
      db,
      share.id,
      { id: "player", email: "player@example.com", displayName: "Player", createdAt: "" },
      { correctCount: 8, wrongCount: 1, skipCount: 0 },
    );

    const runs = await listSharedRuns(db, share.id);
    expect(runs[0]?.displayName).toBe("Player");
    expect(runs[0]?.correctCount).toBe(8);
  });

  it("returns frozen line indices in saved order and ignores later stars", async () => {
    const { db, users } = createRichMockDb();
    users.push({
      id: "owner",
      email: "owner@example.com",
      display_name: "Owner",
      created_at: new Date().toISOString(),
    });
    await putStar(db, "owner", { titleId: "ep", lineIndex: 2 });
    const share = await createFrozenShare(
      db,
      { id: "owner", email: "owner@example.com", displayName: "Owner", createdAt: "" },
      "ep",
      [9, 1, 4],
    );
    await putStar(db, "owner", { titleId: "ep", lineIndex: 8 });

    const queue = await getShareQueue(db, share.id);
    expect(queue).toEqual({ titleId: "ep", lineIndices: [9, 1, 4], frozen: true });
  });
});

describe("share HTTP auth gate", () => {
  it("rejects unauthenticated share queue", async () => {
    const { db } = createRichMockDb();
    const response = await handleRequest(
      new Request("http://localhost/api/shares/abc/queue", {
        headers: { Origin: "http://localhost:5173" },
      }),
      { DB: db, ALLOWED_ORIGINS: "http://localhost:5173" },
    );
    expect(response.status).toBe(401);
  });
});
