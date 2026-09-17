import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import { canonicalPair, normalizeInviteToken } from "../api/src/friends.js";
import { sha256Hex } from "../api/src/crypto.js";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "http://localhost:5173";

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type SessionRow = { id: string; user_id: string; expires_at: string };
type InviteRow = {
  token_hash: string;
  inviter_user_id: string;
  created_at: string;
  expires_at: string | null;
};
type FriendshipRow = { user_a: string; user_b: string; created_at: string };
type BlockRow = { blocker_user_id: string; blocked_user_id: string; created_at: string };

function farFuture(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
}

function createFriendsDb() {
  const users: UserRow[] = [
    {
      id: ALICE_ID,
      email: "alice@example.com",
      display_name: "Alice",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: BOB_ID,
      email: "bob@example.com",
      display_name: "Bob",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const sessions: SessionRow[] = [
    { id: "sess-alice", user_id: ALICE_ID, expires_at: farFuture() },
    { id: "sess-bob", user_id: BOB_ID, expires_at: farFuture() },
  ];
  const invites: InviteRow[] = [];
  const friendships: FriendshipRow[] = [];
  const blocks: BlockRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("DELETE FROM friend_invites WHERE inviter_user_id")) {
                const [userId] = args as [string];
                for (let i = invites.length - 1; i >= 0; i -= 1) {
                  if (invites[i]!.inviter_user_id === userId) invites.splice(i, 1);
                }
              } else if (sql.includes("INSERT INTO friend_invites")) {
                const [hash, userId, createdAt, expiresAt] = args as [
                  string,
                  string,
                  string,
                  string,
                ];
                invites.push({
                  token_hash: hash,
                  inviter_user_id: userId,
                  created_at: createdAt,
                  expires_at: expiresAt,
                });
              } else if (sql.includes("INSERT OR IGNORE INTO friendships")) {
                const [userA, userB, createdAt] = args as [string, string, string];
                if (!friendships.some((row) => row.user_a === userA && row.user_b === userB)) {
                  friendships.push({ user_a: userA, user_b: userB, created_at: createdAt });
                }
              } else if (sql.includes("DELETE FROM friendships WHERE user_a")) {
                const [userA, userB] = args as [string, string];
                const index = friendships.findIndex(
                  (row) => row.user_a === userA && row.user_b === userB,
                );
                if (index !== -1) friendships.splice(index, 1);
              } else if (sql.includes("INSERT OR IGNORE INTO friend_blocks")) {
                const [blocker, blocked, createdAt] = args as [string, string, string];
                if (
                  !blocks.some(
                    (row) => row.blocker_user_id === blocker && row.blocked_user_id === blocked,
                  )
                ) {
                  blocks.push({
                    blocker_user_id: blocker,
                    blocked_user_id: blocked,
                    created_at: createdAt,
                  });
                }
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
              if (sql.includes("FROM friend_invites WHERE token_hash")) {
                const [hash] = args as [string];
                const row = invites.find((invite) => invite.token_hash === hash);
                return (row
                  ? { inviter_user_id: row.inviter_user_id, expires_at: row.expires_at }
                  : null) as T;
              }
              if (sql.includes("FROM friend_invites WHERE inviter_user_id")) {
                const [userId] = args as [string];
                const row = invites.find((invite) => invite.inviter_user_id === userId);
                return (row ?? null) as T;
              }
              if (sql.includes("SELECT display_name FROM users WHERE id")) {
                const [userId] = args as [string];
                const user = users.find((u) => u.id === userId);
                return (user ? { display_name: user.display_name } : null) as T;
              }
              if (sql.includes("FROM friendships WHERE user_a = ? AND user_b = ?")) {
                const [userA, userB] = args as [string, string];
                const row = friendships.find((f) => f.user_a === userA && f.user_b === userB);
                return (row ? { user_a: row.user_a } : null) as T;
              }
              if (sql.includes("FROM friend_blocks")) {
                const [a, b, b2, a2] = args as [string, string, string, string];
                const row = blocks.find(
                  (block) =>
                    (block.blocker_user_id === a && block.blocked_user_id === b) ||
                    (block.blocker_user_id === b2 && block.blocked_user_id === a2),
                );
                return (row ? { blocker_user_id: row.blocker_user_id } : null) as T;
              }
              if (sql.includes("SELECT COUNT(*) AS n FROM friendships")) {
                const [userId] = args as [string];
                const n = friendships.filter((row) => row.user_a === userId || row.user_b === userId)
                  .length;
                return { n } as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM friendships f") && sql.includes("JOIN users u")) {
                const [userId] = args as [string];
                const results = friendships
                  .filter((row) => row.user_a === userId || row.user_b === userId)
                  .map((row) => {
                    const otherId = row.user_a === userId ? row.user_b : row.user_a;
                    const other = users.find((u) => u.id === otherId);
                    return {
                      user_id: otherId,
                      display_name: other?.display_name ?? null,
                    };
                  });
                return { results: results as T[] };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, invites, friendships, blocks };
}

function envFor(db: D1Database) {
  return {
    DB: db,
    APP_ORIGIN: "https://textlinenextline.com",
    ALLOWED_ORIGINS: ORIGIN,
  };
}

function jsonRequest(
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {},
): Request {
  const headers = new Headers({ Origin: ORIGIN });
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`http://localhost${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe("friend helpers", () => {
  it("orders friendship pairs canonically", () => {
    expect(canonicalPair(BOB_ID, ALICE_ID)).toEqual({ userA: ALICE_ID, userB: BOB_ID });
  });

  it("accepts 24-char hex invite tokens", () => {
    expect(normalizeInviteToken("aabbccddeeff001122334455")).toBe("aabbccddeeff001122334455");
    expect(normalizeInviteToken("nope")).toBeNull();
  });
});

describe("friends API", () => {
  it("creates a hashed invite and previews display name only", async () => {
    const { db, invites } = createFriendsDb();
    const created = await handleRequest(
      jsonRequest("/api/friends/invite", { method: "POST", token: "sess-alice" }),
      envFor(db),
    );
    expect(created.status).toBe(200);
    const payload = (await created.json()) as { url: string; reused: boolean };
    expect(payload.reused).toBe(false);
    expect(payload.url).toMatch(/#\/friend\/[a-f0-9]{24}$/);
    const token = payload.url.split("/friend/")[1]!;
    expect(invites[0]?.token_hash).toBe(await sha256Hex(token));

    const preview = await handleRequest(jsonRequest(`/api/friends/invite/${token}`), envFor(db));
    expect(preview.status).toBe(200);
    const body = (await preview.json()) as Record<string, unknown>;
    expect(body).toEqual({ displayName: "Alice" });
    expect(JSON.stringify(body)).not.toContain("alice@example.com");
  });

  it("makes a mutual friendship on accept and never lists emails", async () => {
    const { db } = createFriendsDb();
    const created = await handleRequest(
      jsonRequest("/api/friends/invite", { method: "POST", token: "sess-alice" }),
      envFor(db),
    );
    const { url } = (await created.json()) as { url: string };
    const token = url.split("/friend/")[1]!;

    const accepted = await handleRequest(
      jsonRequest("/api/friends/accept", { method: "POST", token: "sess-bob", body: { token } }),
      envFor(db),
    );
    expect(accepted.status).toBe(200);

    const list = await handleRequest(jsonRequest("/api/friends", { token: "sess-bob" }), envFor(db));
    const data = (await list.json()) as { friends: Array<{ userId: string; displayName: string }> };
    expect(data.friends).toEqual([{ userId: ALICE_ID, displayName: "Alice" }]);
    expect(JSON.stringify(data)).not.toContain("@example.com");
  });

  it("rejects self-accept, blocking, and has no user directory", async () => {
    const { db, invites } = createFriendsDb();
    const created = await handleRequest(
      jsonRequest("/api/friends/invite", { method: "POST", token: "sess-alice" }),
      envFor(db),
    );
    const { url } = (await created.json()) as { url: string };
    const token = url.split("/friend/")[1]!;

    const self = await handleRequest(
      jsonRequest("/api/friends/accept", { method: "POST", token: "sess-alice", body: { token } }),
      envFor(db),
    );
    expect(self.status).toBe(400);

    const accepted = await handleRequest(
      jsonRequest("/api/friends/accept", { method: "POST", token: "sess-bob", body: { token } }),
      envFor(db),
    );
    expect(accepted.status).toBe(200);

    const blocked = await handleRequest(
      jsonRequest(`/api/friends/${BOB_ID}/block`, { method: "POST", token: "sess-alice" }),
      envFor(db),
    );
    expect(blocked.status).toBe(200);

    invites[0]!.created_at = "2020-01-01T00:00:00.000Z";
    const rotated = await handleRequest(
      jsonRequest("/api/friends/invite/rotate", { method: "POST", token: "sess-alice" }),
      envFor(db),
    );
    expect(rotated.status).toBe(200);
    const { url: nextUrl } = (await rotated.json()) as { url: string };
    const nextToken = nextUrl.split("/friend/")[1]!;
    const again = await handleRequest(
      jsonRequest("/api/friends/accept", {
        method: "POST",
        token: "sess-bob",
        body: { token: nextToken },
      }),
      envFor(db),
    );
    expect(again.status).toBe(403);

    const stale = await handleRequest(jsonRequest(`/api/friends/invite/${token}`), envFor(db));
    expect(stale.status).toBe(404);

    const directory = await handleRequest(
      jsonRequest("/api/users", { token: "sess-alice" }),
      envFor(db),
    );
    expect([404, 405]).toContain(directory.status);

    const getAccept = await handleRequest(
      jsonRequest("/api/friends/accept", { token: "sess-bob" }),
      envFor(db),
    );
    expect(getAccept.status).toBe(404);

    const anonList = await handleRequest(jsonRequest("/api/friends"), envFor(db));
    expect(anonList.status).toBe(401);
  });
});
