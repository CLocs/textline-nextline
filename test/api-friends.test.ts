import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import { currentDailyStreak } from "../api/src/dailyStreak.js";
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
type StreakRow = { user_id: string; last_completed_on: string; streak: number };

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
  const streaks: StreakRow[] = [];
  const avatars = new Map<string, { at: string; bytes: Uint8Array }>();

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
              } else if (sql.includes("DELETE FROM friend_group_members")) {
                // Groups tables are optional in this mock; unfriend/block always attempt cleanup.
              } else if (sql.includes("UPDATE users SET avatar = NULL")) {
                const [userId] = args as [string];
                avatars.delete(userId);
              } else if (sql.includes("UPDATE users SET avatar = ?")) {
                const [bytes, avatarAt, userId] = args as [Uint8Array, string, string];
                avatars.set(userId, { at: avatarAt, bytes });
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
              if (sql.includes("SELECT avatar_at FROM users WHERE id")) {
                const [userId] = args as [string];
                return { avatar_at: avatars.get(userId)?.at ?? null } as T;
              }
              if (sql.includes("SELECT avatar FROM users WHERE id")) {
                const [userId] = args as [string];
                const row = avatars.get(userId);
                return (row ? { avatar: row.bytes } : null) as T;
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
                    const streak = streaks.find((row) => row.user_id === otherId);
                    return {
                      user_id: otherId,
                      display_name: other?.display_name ?? null,
                      avatar_at: avatars.get(otherId)?.at ?? null,
                      streak: streak?.streak ?? null,
                      last_completed_on: streak?.last_completed_on ?? null,
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

  return { db, invites, friendships, blocks, streaks };
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

describe("current daily streak", () => {
  const now = new Date("2026-09-28T20:00:00.000Z");

  it("keeps a streak finished today, yesterday, or tomorrow UTC", () => {
    expect(currentDailyStreak({ lastCompletedOn: "2026-09-28", streak: 4 }, now)).toBe(4);
    expect(currentDailyStreak({ lastCompletedOn: "2026-09-27", streak: 4 }, now)).toBe(4);
    expect(currentDailyStreak({ lastCompletedOn: "2026-09-29", streak: 4 }, now)).toBe(4);
  });

  it("hides a lapsed or empty streak", () => {
    expect(currentDailyStreak({ lastCompletedOn: "2026-09-26", streak: 9 }, now)).toBe(0);
    expect(currentDailyStreak({ lastCompletedOn: null, streak: 3 }, now)).toBe(0);
    expect(currentDailyStreak({ lastCompletedOn: "2026-09-28", streak: 0 }, now)).toBe(0);
  });
});

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
    expect(data.friends).toEqual([
      { userId: ALICE_ID, displayName: "Alice", streak: 0, avatarAt: null },
    ]);
    expect(JSON.stringify(data)).not.toContain("@example.com");
  });

  it("returns a current day-streak and hides a lapsed one", async () => {
    const { db, friendships, streaks } = createFriendsDb();
    friendships.push({
      user_a: ALICE_ID,
      user_b: BOB_ID,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    const utcToday = new Date().toISOString().slice(0, 10);
    streaks.push({ user_id: ALICE_ID, last_completed_on: utcToday, streak: 4 });
    streaks.push({ user_id: BOB_ID, last_completed_on: "2020-01-01", streak: 9 });

    const asBob = await handleRequest(jsonRequest("/api/friends", { token: "sess-bob" }), envFor(db));
    const bobList = (await asBob.json()) as {
      friends: Array<{ userId: string; displayName: string; streak: number }>;
    };
    expect(bobList.friends).toEqual([
      { userId: ALICE_ID, displayName: "Alice", streak: 4, avatarAt: null },
    ]);
    expect(JSON.stringify(bobList)).not.toContain("lastCompletedOn");

    const asAlice = await handleRequest(
      jsonRequest("/api/friends", { token: "sess-alice" }),
      envFor(db),
    );
    const aliceList = (await asAlice.json()) as {
      friends: Array<{ userId: string; displayName: string; streak: number }>;
    };
    expect(aliceList.friends).toEqual([
      { userId: BOB_ID, displayName: "Bob", streak: 0, avatarAt: null },
    ]);
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

  it("stores a profile jpeg for you and your friends", async () => {
    const { db, friendships } = createFriendsDb();
    friendships.push({
      user_a: ALICE_ID,
      user_b: BOB_ID,
      created_at: "2026-01-02T00:00:00.000Z",
    });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1]);
    const headers = new Headers({
      Origin: ORIGIN,
      Authorization: "Bearer sess-alice",
      "Content-Type": "image/jpeg",
    });
    const uploaded = await handleRequest(
      new Request("http://localhost/api/auth/me/avatar", { method: "POST", headers, body: jpeg }),
      envFor(db),
    );
    expect(uploaded.status).toBe(200);
    const saved = (await uploaded.json()) as { avatarAt: string };
    expect(saved.avatarAt).toMatch(/^\d{4}-/);

    const rejected = await handleRequest(
      new Request("http://localhost/api/auth/me/avatar", {
        method: "POST",
        headers,
        body: new Uint8Array([1, 2, 3]),
      }),
      envFor(db),
    );
    expect(rejected.status).toBe(400);

    const list = await handleRequest(jsonRequest("/api/friends", { token: "sess-bob" }), envFor(db));
    const data = (await list.json()) as { friends: Array<{ avatarAt: string | null }> };
    expect(data.friends[0]?.avatarAt).toBe(saved.avatarAt);

    const picture = await handleRequest(
      jsonRequest(`/api/avatars/${ALICE_ID}`, { token: "sess-bob" }),
      envFor(db),
    );
    expect(picture.status).toBe(200);
    expect(picture.headers.get("content-type")).toContain("image/jpeg");

    const hidden = await handleRequest(
      jsonRequest("/api/avatars/33333333-3333-4333-8333-333333333333", { token: "sess-alice" }),
      envFor(db),
    );
    expect(hidden.status).toBe(404);

    const removed = await handleRequest(
      jsonRequest("/api/auth/me/avatar", { method: "DELETE", token: "sess-alice" }),
      envFor(db),
    );
    expect(removed.status).toBe(200);
    const gone = await handleRequest(
      jsonRequest(`/api/avatars/${ALICE_ID}`, { token: "sess-bob" }),
      envFor(db),
    );
    expect(gone.status).toBe(404);
  });
});
