import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import { canonicalPair } from "../api/src/friends.js";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";
const CAROL_ID = "33333333-3333-4333-8333-333333333333";
const ORIGIN = "http://localhost:5173";
const TITLE_ID = "the-wolf-of-wall-street-2013";

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type SessionRow = { id: string; user_id: string; expires_at: string };
type FriendshipRow = { user_a: string; user_b: string; created_at: string };
type BlockRow = { blocker_user_id: string; blocked_user_id: string; created_at: string };
type GroupRow = { id: string; owner_user_id: string; name: string; created_at: string };
type GroupMemberRow = { group_id: string; user_id: string; created_at: string };
type ShareRow = {
  id: string;
  owner_user_id: string;
  title_id: string;
  created_at: string;
  line_indices: string | null;
};
type InboxRow = {
  id: string;
  share_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  title_id: string;
  prompt_line_index: number;
  created_at: string;
};

function farFuture(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
}

function addFriendship(rows: FriendshipRow[], a: string, b: string) {
  const pair = canonicalPair(a, b);
  if (!rows.some((row) => row.user_a === pair.userA && row.user_b === pair.userB)) {
    rows.push({ user_a: pair.userA, user_b: pair.userB, created_at: "2026-01-02T00:00:00.000Z" });
  }
}

function createGroupsDb(options?: { carolFriend?: boolean }) {
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
    {
      id: CAROL_ID,
      email: "carol@example.com",
      display_name: "Carol",
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const sessions: SessionRow[] = [
    { id: "sess-alice", user_id: ALICE_ID, expires_at: farFuture() },
    { id: "sess-bob", user_id: BOB_ID, expires_at: farFuture() },
    { id: "sess-carol", user_id: CAROL_ID, expires_at: farFuture() },
  ];
  const friendships: FriendshipRow[] = [];
  addFriendship(friendships, ALICE_ID, BOB_ID);
  if (options?.carolFriend !== false) addFriendship(friendships, ALICE_ID, CAROL_ID);
  const blocks: BlockRow[] = [];
  const groups: GroupRow[] = [];
  const members: GroupMemberRow[] = [];
  const shares: ShareRow[] = [];
  const inbox: InboxRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO friend_groups")) {
                const [id, owner, name, createdAt] = args as [string, string, string, string];
                groups.push({ id, owner_user_id: owner, name, created_at: createdAt });
              } else if (sql.includes("INSERT OR IGNORE INTO friend_group_members")) {
                const [groupId, userId, createdAt] = args as [string, string, string];
                if (!members.some((row) => row.group_id === groupId && row.user_id === userId)) {
                  members.push({ group_id: groupId, user_id: userId, created_at: createdAt });
                }
              } else if (sql.includes("DELETE FROM friend_group_members") && sql.includes("group_id IN")) {
                const [memberId, ownerId] = args as [string, string];
                const owned = new Set(
                  groups.filter((group) => group.owner_user_id === ownerId).map((group) => group.id),
                );
                for (let i = members.length - 1; i >= 0; i -= 1) {
                  const row = members[i]!;
                  if (row.user_id === memberId && owned.has(row.group_id)) members.splice(i, 1);
                }
              } else if (sql.includes("DELETE FROM friend_group_members WHERE group_id = ? AND user_id")) {
                const [groupId, userId] = args as [string, string];
                const index = members.findIndex(
                  (row) => row.group_id === groupId && row.user_id === userId,
                );
                if (index !== -1) members.splice(index, 1);
              } else if (sql.includes("DELETE FROM friend_group_members WHERE group_id")) {
                const [groupId] = args as [string];
                for (let i = members.length - 1; i >= 0; i -= 1) {
                  if (members[i]!.group_id === groupId) members.splice(i, 1);
                }
              } else if (sql.includes("DELETE FROM friend_groups")) {
                const [id, owner] = args as [string, string];
                const index = groups.findIndex((row) => row.id === id && row.owner_user_id === owner);
                if (index !== -1) groups.splice(index, 1);
              } else if (sql.includes("INSERT INTO mini_shares")) {
                const [id, owner, titleId, createdAt, lineIndices] = args as [
                  string,
                  string,
                  string,
                  string,
                  string,
                ];
                shares.push({
                  id,
                  owner_user_id: owner,
                  title_id: titleId,
                  created_at: createdAt,
                  line_indices: lineIndices,
                });
              } else if (sql.includes("INSERT OR IGNORE INTO line_inbox")) {
                const [id, shareId, sender, recipient, titleId, lineIndex, createdAt] = args as [
                  string,
                  string,
                  string,
                  string,
                  string,
                  number,
                  string,
                ];
                if (!inbox.some((row) => row.recipient_user_id === recipient && row.share_id === shareId)) {
                  inbox.push({
                    id,
                    share_id: shareId,
                    sender_user_id: sender,
                    recipient_user_id: recipient,
                    title_id: titleId,
                    prompt_line_index: lineIndex,
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
              if (sql.includes("SELECT COUNT(*) AS n FROM line_inbox")) {
                const [userId] = args as [string];
                return { n: inbox.filter((row) => row.recipient_user_id === userId).length } as T;
              }
              if (sql.includes("SELECT COUNT(*) AS n FROM friend_groups")) {
                const [ownerId] = args as [string];
                return { n: groups.filter((row) => row.owner_user_id === ownerId).length } as T;
              }
              if (sql.includes("SELECT COUNT(*) AS n FROM friend_group_members")) {
                const [groupId] = args as [string];
                return { n: members.filter((row) => row.group_id === groupId).length } as T;
              }
              if (sql.includes("FROM mini_shares WHERE owner_user_id")) {
                const [userId] = args as [string];
                const rows = shares.filter((share) => share.owner_user_id === userId);
                const last = rows[rows.length - 1];
                return (last ? { created_at: last.created_at } : null) as T;
              }
              if (sql.includes("SELECT id FROM friend_groups WHERE id = ? AND owner_user_id")) {
                const [id, owner] = args as [string, string];
                const row = groups.find((group) => group.id === id && group.owner_user_id === owner);
                return (row ? { id: row.id } : null) as T;
              }
              if (sql.includes("SELECT created_at FROM friend_groups")) {
                const [ownerId] = args as [string];
                const rows = groups.filter((group) => group.owner_user_id === ownerId);
                const last = rows[rows.length - 1];
                return (last ? { created_at: last.created_at } : null) as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("FROM line_inbox i")) {
                const [userId] = args as [string];
                const results = inbox
                  .filter((row) => row.recipient_user_id === userId)
                  .map((row) => {
                    const sender = users.find((u) => u.id === row.sender_user_id);
                    return {
                      id: row.id,
                      share_id: row.share_id,
                      title_id: row.title_id,
                      prompt_line_index: row.prompt_line_index,
                      created_at: row.created_at,
                      sender_id: row.sender_user_id,
                      display_name: sender?.display_name ?? null,
                    };
                  });
                return { results: results as T[] };
              }
              if (sql.includes("FROM friend_group_members m")) {
                const [ownerId] = args as [string];
                const owned = new Set(
                  groups.filter((group) => group.owner_user_id === ownerId).map((group) => group.id),
                );
                const results = members
                  .filter((row) => owned.has(row.group_id))
                  .map((row) => {
                    const user = users.find((item) => item.id === row.user_id);
                    return {
                      group_id: row.group_id,
                      user_id: row.user_id,
                      display_name: user?.display_name ?? null,
                    };
                  });
                return { results: results as T[] };
              }
              if (sql.includes("SELECT user_id FROM friend_group_members")) {
                const [groupId] = args as [string];
                return {
                  results: members
                    .filter((row) => row.group_id === groupId)
                    .map((row) => ({ user_id: row.user_id })) as T[],
                };
              }
              if (sql.includes("SELECT id, name, created_at FROM friend_groups")) {
                const [ownerId] = args as [string];
                return {
                  results: groups
                    .filter((row) => row.owner_user_id === ownerId)
                    .map((row) => ({
                      id: row.id,
                      name: row.name,
                      created_at: row.created_at,
                    })) as T[],
                };
              }
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, blocks, inbox, shares };
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

async function createMovieNight(db: D1Database): Promise<string> {
  const created = await handleRequest(
    jsonRequest("/api/groups", {
      method: "POST",
      token: "sess-alice",
      body: { name: "Movie night" },
    }),
    envFor(db),
  );
  expect(created.status).toBe(200);
  const payload = (await created.json()) as { id: string };
  return payload.id;
}

describe("friend groups API", () => {
  it("sends one frozen share to every group member", async () => {
    const { db, shares } = createGroupsDb();
    const groupId = await createMovieNight(db);

    for (const userId of [BOB_ID, CAROL_ID]) {
      const added = await handleRequest(
        jsonRequest(`/api/groups/${groupId}/members`, {
          method: "POST",
          token: "sess-alice",
          body: { userId },
        }),
        envFor(db),
      );
      expect(added.status).toBe(200);
    }

    const listed = await handleRequest(jsonRequest("/api/groups", { token: "sess-alice" }), envFor(db));
    const groups = (await listed.json()) as {
      groups: Array<{ name: string; members: Array<{ userId: string; displayName: string }> }>;
    };
    expect(groups.groups).toHaveLength(1);
    expect(groups.groups[0]?.name).toBe("Movie night");
    expect(groups.groups[0]?.members.map((member) => member.userId).sort()).toEqual(
      [BOB_ID, CAROL_ID].sort(),
    );
    expect(JSON.stringify(groups)).not.toContain("@example.com");

    const sent = await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27, groupId },
      }),
      envFor(db),
    );
    expect(sent.status).toBe(200);
    const payload = (await sent.json()) as { shareId: string; sent: number; skipped: number };
    expect(payload.sent).toBe(2);
    expect(payload.skipped).toBe(0);
    expect(shares).toHaveLength(1);

    const bobInbox = await handleRequest(jsonRequest("/api/inbox", { token: "sess-bob" }), envFor(db));
    const carolInbox = await handleRequest(jsonRequest("/api/inbox", { token: "sess-carol" }), envFor(db));
    const bobItems = (await bobInbox.json()) as { items: Array<{ shareId: string }> };
    const carolItems = (await carolInbox.json()) as { items: Array<{ shareId: string }> };
    expect(bobItems.items).toHaveLength(1);
    expect(carolItems.items).toHaveLength(1);
    expect(bobItems.items[0]?.shareId).toBe(payload.shareId);
    expect(carolItems.items[0]?.shareId).toBe(payload.shareId);
  });

  it("rejects adding a non-friend", async () => {
    const { db } = createGroupsDb({ carolFriend: false });
    const groupId = await createMovieNight(db);
    const denied = await handleRequest(
      jsonRequest(`/api/groups/${groupId}/members`, {
        method: "POST",
        token: "sess-alice",
        body: { userId: CAROL_ID },
      }),
      envFor(db),
    );
    expect(denied.status).toBe(403);
  });

  it("skips a blocked member and still fans out one share", async () => {
    const { db, blocks } = createGroupsDb();
    const groupId = await createMovieNight(db);
    for (const userId of [BOB_ID, CAROL_ID]) {
      const added = await handleRequest(
        jsonRequest(`/api/groups/${groupId}/members`, {
          method: "POST",
          token: "sess-alice",
          body: { userId },
        }),
        envFor(db),
      );
      expect(added.status).toBe(200);
    }

    blocks.push({
      blocker_user_id: ALICE_ID,
      blocked_user_id: BOB_ID,
      created_at: "2026-01-04T00:00:00.000Z",
    });

    const sent = await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27, groupId },
      }),
      envFor(db),
    );
    expect(sent.status).toBe(200);
    const payload = (await sent.json()) as { shareId: string; sent: number; skipped: number };
    expect(payload.sent).toBe(1);
    expect(payload.skipped).toBe(1);

    const bobInbox = await handleRequest(jsonRequest("/api/inbox", { token: "sess-bob" }), envFor(db));
    const carolInbox = await handleRequest(jsonRequest("/api/inbox", { token: "sess-carol" }), envFor(db));
    const bobItems = (await bobInbox.json()) as { items: Array<{ shareId: string }> };
    const carolItems = (await carolInbox.json()) as { items: Array<{ shareId: string }> };
    expect(bobItems.items).toHaveLength(0);
    expect(carolItems.items).toHaveLength(1);
    expect(carolItems.items[0]?.shareId).toBe(payload.shareId);
  });
});
