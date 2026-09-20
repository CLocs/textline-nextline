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
  group_id: string | null;
  read_at: string | null;
};
type ChatMessageRow = {
  id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
  dm_user_a: string | null;
  dm_user_b: string | null;
  group_id: string | null;
};
type ThreadReadRow = { user_id: string; thread_key: string; last_read_at: string };

function farFuture(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60_000).toISOString();
}

function addFriendship(rows: FriendshipRow[], a: string, b: string) {
  const pair = canonicalPair(a, b);
  if (!rows.some((row) => row.user_a === pair.userA && row.user_b === pair.userB)) {
    rows.push({ user_a: pair.userA, user_b: pair.userB, created_at: "2026-01-02T00:00:00.000Z" });
  }
}

function createChatsDb() {
  const users: UserRow[] = [
    { id: ALICE_ID, email: "alice@example.com", display_name: "Alice", created_at: "2026-01-01T00:00:00.000Z" },
    { id: BOB_ID, email: "bob@example.com", display_name: "Bob", created_at: "2026-01-01T00:00:00.000Z" },
    { id: CAROL_ID, email: "carol@example.com", display_name: "Carol", created_at: "2026-01-01T00:00:00.000Z" },
  ];
  const sessions: SessionRow[] = [
    { id: "sess-alice", user_id: ALICE_ID, expires_at: farFuture() },
    { id: "sess-bob", user_id: BOB_ID, expires_at: farFuture() },
    { id: "sess-carol", user_id: CAROL_ID, expires_at: farFuture() },
  ];
  const friendships: FriendshipRow[] = [];
  addFriendship(friendships, ALICE_ID, BOB_ID);
  addFriendship(friendships, ALICE_ID, CAROL_ID);
  addFriendship(friendships, BOB_ID, CAROL_ID);
  const blocks: BlockRow[] = [];
  const groups: GroupRow[] = [];
  const members: GroupMemberRow[] = [];
  const shares: ShareRow[] = [];
  const inbox: InboxRow[] = [];
  const chatMessages: ChatMessageRow[] = [];
  const threadReads: ThreadReadRow[] = [];

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
                const [id, shareId, sender, recipient, titleId, lineIndex, createdAt, groupId] =
                  args as [string, string, string, string, string, number, string, string | null | undefined];
                if (!inbox.some((row) => row.recipient_user_id === recipient && row.share_id === shareId)) {
                  inbox.push({
                    id,
                    share_id: shareId,
                    sender_user_id: sender,
                    recipient_user_id: recipient,
                    title_id: titleId,
                    prompt_line_index: lineIndex,
                    created_at: createdAt,
                    group_id: groupId ?? null,
                    read_at: null,
                  });
                }
              } else if (sql.includes("UPDATE line_inbox SET read_at")) {
                const [readAt, recipientId, peerOrGroup] = args as [string, string, string];
                for (const row of inbox) {
                  if (row.recipient_user_id !== recipientId || row.read_at) continue;
                  if (sql.includes("group_id = ?")) {
                    if (row.group_id === peerOrGroup) row.read_at = readAt;
                  } else if (sql.includes("group_id IS NULL") && row.sender_user_id === peerOrGroup && !row.group_id) {
                    row.read_at = readAt;
                  }
                }
              } else if (sql.includes("INSERT INTO chat_messages")) {
                const [id, sender, body, createdAt, dmA, dmB, groupId] = args as [
                  string,
                  string,
                  string,
                  string,
                  string | null,
                  string | null,
                  string | null,
                ];
                chatMessages.push({
                  id,
                  sender_user_id: sender,
                  body,
                  created_at: createdAt,
                  dm_user_a: dmA,
                  dm_user_b: dmB,
                  group_id: groupId,
                });
              } else if (sql.includes("INSERT INTO chat_thread_reads")) {
                const [userId, threadKey, lastReadAt] = args as [string, string, string];
                const existing = threadReads.find(
                  (row) => row.user_id === userId && row.thread_key === threadKey,
                );
                if (existing) existing.last_read_at = lastReadAt;
                else threadReads.push({ user_id: userId, thread_key: threadKey, last_read_at: lastReadAt });
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
                return null;
              }
              if (sql.includes("SELECT COUNT(*) AS n FROM line_inbox")) {
                if (sql.includes("read_at IS NULL") && sql.includes("group_id = ?")) {
                  const [userId, groupId] = args as [string, string];
                  return {
                    n: inbox.filter(
                      (row) =>
                        row.recipient_user_id === userId &&
                        row.group_id === groupId &&
                        !row.read_at,
                    ).length,
                  } as T;
                }
                if (sql.includes("read_at IS NULL") && sql.includes("group_id IS NULL")) {
                  const [userId, senderId] = args as [string, string];
                  return {
                    n: inbox.filter(
                      (row) =>
                        row.recipient_user_id === userId &&
                        row.sender_user_id === senderId &&
                        !row.group_id &&
                        !row.read_at,
                    ).length,
                  } as T;
                }
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
              if (sql.includes("FROM mini_shares WHERE owner_user_id") && sql.includes("line_indices")) {
                return null;
              }
              if (sql.includes("FROM mini_shares WHERE owner_user_id")) {
                return null;
              }
              if (sql.includes("SELECT id FROM friend_groups WHERE id = ? AND owner_user_id")) {
                const [id, owner] = args as [string, string];
                const row = groups.find((group) => group.id === id && group.owner_user_id === owner);
                return (row ? { id: row.id } : null) as T;
              }
              if (sql.includes("SELECT id, owner_user_id, name, created_at FROM friend_groups WHERE id = ?")) {
                const [id] = args as [string];
                const row = groups.find((group) => group.id === id);
                return (row
                  ? {
                      id: row.id,
                      owner_user_id: row.owner_user_id,
                      name: row.name,
                      created_at: row.created_at,
                    }
                  : null) as T;
              }
              if (sql.includes("SELECT user_id FROM friend_group_members WHERE group_id = ? AND user_id = ?")) {
                const [groupId, userId] = args as [string, string];
                const row = members.find((m) => m.group_id === groupId && m.user_id === userId);
                return (row ? { user_id: row.user_id } : null) as T;
              }
              if (sql.includes("SELECT id, display_name FROM users WHERE id = ?")) {
                const [id] = args as [string];
                const user = users.find((u) => u.id === id);
                return (user ? { id: user.id, display_name: user.display_name } : null) as T;
              }
              if (sql.includes("SELECT created_at FROM friend_groups")) {
                return null;
              }
              if (sql.includes("FROM line_inbox") && sql.includes("ORDER BY created_at DESC") && sql.includes("LIMIT 1")) {
                const filtered = inbox.filter((row) => {
                  if (sql.includes("group_id = ?")) {
                    const [groupId] = args as [string];
                    return row.group_id === groupId;
                  }
                  if (sql.includes("group_id IS NULL")) {
                    const [a, b, c, d] = args as [string, string, string, string];
                    return (
                      !row.group_id &&
                      ((row.sender_user_id === a && row.recipient_user_id === b) ||
                        (row.sender_user_id === c && row.recipient_user_id === d))
                    );
                  }
                  return false;
                });
                const last = filtered.sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
                return (last
                  ? {
                      id: last.id,
                      share_id: last.share_id,
                      title_id: last.title_id,
                      prompt_line_index: last.prompt_line_index,
                      created_at: last.created_at,
                      sender_user_id: last.sender_user_id,
                      recipient_user_id: last.recipient_user_id,
                    }
                  : null) as T;
              }
              if (sql.includes("FROM chat_thread_reads")) {
                const [userId, threadKey] = args as [string, string];
                const row = threadReads.find(
                  (item) => item.user_id === userId && item.thread_key === threadKey,
                );
                return (row ? { last_read_at: row.last_read_at } : null) as T;
              }
              if (sql.includes("SELECT COUNT(*) AS n FROM chat_messages")) {
                const since = String(args[args.length - 1]);
                const senderExclude = String(args[args.length - 2]);
                if (sql.includes("group_id = ?")) {
                  const [groupId] = args as [string];
                  return {
                    n: chatMessages.filter(
                      (row) =>
                        row.group_id === groupId &&
                        row.sender_user_id !== senderExclude &&
                        row.created_at > since,
                    ).length,
                  } as T;
                }
                const [dmA, dmB] = args as [string, string];
                return {
                  n: chatMessages.filter(
                    (row) =>
                      row.dm_user_a === dmA &&
                      row.dm_user_b === dmB &&
                      row.sender_user_id !== senderExclude &&
                      row.created_at > since,
                  ).length,
                } as T;
              }
              if (
                sql.includes("FROM chat_messages") &&
                sql.includes("ORDER BY created_at DESC") &&
                sql.includes("LIMIT 1")
              ) {
                const filtered = chatMessages.filter((row) => {
                  if (sql.includes("group_id = ?")) {
                    const [groupId] = args as [string];
                    return row.group_id === groupId;
                  }
                  const [dmA, dmB] = args as [string, string];
                  return row.dm_user_a === dmA && row.dm_user_b === dmB;
                });
                const last = filtered.sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
                return (last
                  ? {
                      body: last.body,
                      created_at: last.created_at,
                      sender_user_id: last.sender_user_id,
                    }
                  : null) as T;
              }
              return null;
            },
            async all<T>() {
              if (sql.includes("CASE WHEN dm_user_a = ?")) {
                const [viewer] = args as [string];
                const peers = new Set<string>();
                for (const row of chatMessages) {
                  if (row.group_id || !row.dm_user_a || !row.dm_user_b) continue;
                  if (row.dm_user_a !== viewer && row.dm_user_b !== viewer) continue;
                  peers.add(row.dm_user_a === viewer ? row.dm_user_b : row.dm_user_a);
                }
                return {
                  results: [...peers].map((peer_id) => ({ peer_id })) as T[],
                };
              }
              if (sql.includes("CASE WHEN sender_user_id")) {
                const [viewer] = args as [string];
                const peers = new Map<string, string>();
                for (const row of inbox) {
                  if (row.group_id) continue;
                  if (row.sender_user_id !== viewer && row.recipient_user_id !== viewer) continue;
                  const peer =
                    row.sender_user_id === viewer ? row.recipient_user_id : row.sender_user_id;
                  const prev = peers.get(peer);
                  if (!prev || row.created_at > prev) peers.set(peer, row.created_at);
                }
                return {
                  results: [...peers.entries()].map(([peer_id, last_at]) => ({ peer_id, last_at })) as T[],
                };
              }
              if (sql.includes("FROM chat_messages m") && sql.includes("JOIN users u")) {
                const filtered = chatMessages.filter((row) => {
                  if (sql.includes("WHERE m.group_id = ?")) {
                    const [groupId] = args as [string];
                    return row.group_id === groupId;
                  }
                  const [dmA, dmB] = args as [string, string];
                  return row.dm_user_a === dmA && row.dm_user_b === dmB;
                });
                return {
                  results: filtered
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((row) => {
                      const sender = users.find((u) => u.id === row.sender_user_id);
                      return {
                        id: row.id,
                        body: row.body,
                        created_at: row.created_at,
                        sender_user_id: row.sender_user_id,
                        sender_name: sender?.display_name ?? null,
                      };
                    }) as T[],
                };
              }
              if (sql.includes("FROM friendships") && sql.includes("JOIN users")) {
                const [userId] = args as [string];
                const results = friendships
                  .filter((row) => row.user_a === userId || row.user_b === userId)
                  .map((row) => {
                    const peerId = row.user_a === userId ? row.user_b : row.user_a;
                    const peer = users.find((u) => u.id === peerId);
                    return {
                      user_id: peerId,
                      display_name: peer?.display_name ?? null,
                    };
                  });
                return { results: results as T[] };
              }
              if (
                sql.includes("FROM friend_group_members m") &&
                sql.includes("JOIN friend_groups g") &&
                sql.includes("WHERE m.user_id = ?")
              ) {
                const [userId] = args as [string];
                const results = members
                  .filter((row) => row.user_id === userId)
                  .map((row) => {
                    const group = groups.find((g) => g.id === row.group_id);
                    if (!group) return null;
                    return {
                      id: group.id,
                      owner_user_id: group.owner_user_id,
                      name: group.name,
                      created_at: group.created_at,
                    };
                  })
                  .filter(Boolean);
                return { results: results as T[] };
              }
              if (sql.includes("FROM friend_group_members m") && sql.includes("WHERE m.group_id IN")) {
                const groupIds = args as string[];
                const idSet = new Set(groupIds);
                const results = members
                  .filter((row) => idSet.has(row.group_id))
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
              if (
                sql.includes("owner_user_id, name, created_at FROM friend_groups") &&
                sql.includes("WHERE owner_user_id")
              ) {
                const [ownerId] = args as [string];
                return {
                  results: groups
                    .filter((row) => row.owner_user_id === ownerId)
                    .map((row) => ({
                      id: row.id,
                      owner_user_id: row.owner_user_id,
                      name: row.name,
                      created_at: row.created_at,
                    })) as T[],
                };
              }
              if (sql.includes("FROM line_inbox") && sql.includes("group_id = ?")) {
                const [groupId] = args as [string];
                const results = inbox
                  .filter((row) => row.group_id === groupId)
                  .map((row) => {
                    const sender = users.find((u) => u.id === row.sender_user_id);
                    return {
                      id: row.id,
                      share_id: row.share_id,
                      title_id: row.title_id,
                      prompt_line_index: row.prompt_line_index,
                      created_at: row.created_at,
                      sender_user_id: row.sender_user_id,
                      recipient_user_id: row.recipient_user_id,
                      read_at: row.read_at,
                      sender_name: sender?.display_name ?? null,
                    };
                  });
                return { results: results as T[] };
              }
              if (sql.includes("FROM line_inbox") && sql.includes("group_id IS NULL")) {
                const [a, b, c, d] = args as [string, string, string, string];
                const results = inbox
                  .filter(
                    (row) =>
                      !row.group_id &&
                      ((row.sender_user_id === a && row.recipient_user_id === b) ||
                        (row.sender_user_id === c && row.recipient_user_id === d)),
                  )
                  .map((row) => {
                    const sender = users.find((u) => u.id === row.sender_user_id);
                    return {
                      id: row.id,
                      share_id: row.share_id,
                      title_id: row.title_id,
                      prompt_line_index: row.prompt_line_index,
                      created_at: row.created_at,
                      sender_user_id: row.sender_user_id,
                      recipient_user_id: row.recipient_user_id,
                      read_at: row.read_at,
                      sender_name: sender?.display_name ?? null,
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

  return { db, inbox };
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

describe("chats API", () => {
  it("keeps group sends out of DM threads and shares one group transcript", async () => {
    const { db } = createChatsDb();

    const created = await handleRequest(
      jsonRequest("/api/groups", { method: "POST", token: "sess-alice", body: { name: "Movie night" } }),
      envFor(db),
    );
    const group = (await created.json()) as { id: string };

    for (const userId of [BOB_ID, CAROL_ID]) {
      await handleRequest(
        jsonRequest(`/api/groups/${group.id}/members`, {
          method: "POST",
          token: "sess-alice",
          body: { userId },
        }),
        envFor(db),
      );
    }

    await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27, toUserId: BOB_ID },
      }),
      envFor(db),
    );

    await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 40, groupId: group.id },
      }),
      envFor(db),
    );

    const dm = await handleRequest(
      jsonRequest(`/api/chats/dm/${BOB_ID}`, { token: "sess-alice" }),
      envFor(db),
    );
    expect(dm.status).toBe(200);
    const dmBody = (await dm.json()) as {
      peer: { userId: string; displayName: string };
      messages: Array<{ kind?: string; lineIndex?: number; direction?: string; receipt?: string | null }>;
    };
    expect(dmBody.peer).toEqual({ userId: BOB_ID, displayName: "Bob" });
    expect(dmBody.messages.map((m) => m.lineIndex)).toEqual([27]);
    expect(dmBody.messages[0]).toMatchObject({
      kind: "quote",
      direction: "out",
      receipt: "sent",
    });

    await handleRequest(
      jsonRequest(`/api/chats/dm/${ALICE_ID}/read`, { method: "POST", token: "sess-bob" }),
      envFor(db),
    );
    const dmAfterRead = await handleRequest(
      jsonRequest(`/api/chats/dm/${BOB_ID}`, { token: "sess-alice" }),
      envFor(db),
    );
    const after = (await dmAfterRead.json()) as {
      messages: Array<{ receipt: string | null }>;
    };
    expect(after.messages[0]?.receipt).toBe("read");

    const postText = await handleRequest(
      jsonRequest(`/api/chats/dm/${BOB_ID}/messages`, {
        method: "POST",
        token: "sess-alice",
        body: { body: "Hello Bob" },
      }),
      envFor(db),
    );
    expect(postText.status).toBe(200);
    const dmWithText = await handleRequest(
      jsonRequest(`/api/chats/dm/${ALICE_ID}`, { token: "sess-bob" }),
      envFor(db),
    );
    expect(dmWithText.status).toBe(200);
    const mixed = (await dmWithText.json()) as {
      messages: Array<{ kind: string; body?: string }>;
    };
    expect(mixed.messages.map((m) => m.kind)).toEqual(["quote", "text"]);
    expect(mixed.messages[1]).toMatchObject({ kind: "text", body: "Hello Bob" });

    const bobThreads = await handleRequest(jsonRequest("/api/chats", { token: "sess-bob" }), envFor(db));
    const bobList = (await bobThreads.json()) as {
      threads: Array<{
        kind: string;
        peerUserId?: string;
        quoteUnreadCount?: number;
        textUnreadCount?: number;
      }>;
    };
    const bobDm = bobList.threads.find((t) => t.kind === "dm" && t.peerUserId === ALICE_ID);
    expect(bobDm?.textUnreadCount).toBe(1);

    await handleRequest(
      jsonRequest(`/api/chats/dm/${ALICE_ID}/read`, { method: "POST", token: "sess-bob" }),
      envFor(db),
    );
    const bobThreadsAfter = await handleRequest(
      jsonRequest("/api/chats", { token: "sess-bob" }),
      envFor(db),
    );
    const bobListAfter = (await bobThreadsAfter.json()) as {
      threads: Array<{ peerUserId?: string; textUnreadCount?: number }>;
    };
    expect(
      bobListAfter.threads.find((t) => t.peerUserId === ALICE_ID)?.textUnreadCount,
    ).toBe(0);

    const groupAlice = await handleRequest(
      jsonRequest(`/api/chats/group/${group.id}`, { token: "sess-alice" }),
      envFor(db),
    );
    const groupBob = await handleRequest(
      jsonRequest(`/api/chats/group/${group.id}`, { token: "sess-bob" }),
      envFor(db),
    );
    expect(groupAlice.status).toBe(200);
    expect(groupBob.status).toBe(200);
    const aliceMsgs = (await groupAlice.json()) as {
      messages: Array<{ kind?: string; lineIndex?: number; shareId?: string }>;
    };
    const bobMsgs = (await groupBob.json()) as {
      messages: Array<{ kind?: string; lineIndex?: number; shareId?: string }>;
    };
    expect(aliceMsgs.messages).toHaveLength(1);
    expect(bobMsgs.messages).toHaveLength(1);
    expect(aliceMsgs.messages[0]?.lineIndex).toBe(40);
    expect(bobMsgs.messages[0]?.shareId).toBe(aliceMsgs.messages[0]?.shareId);

    const bobSend = await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-bob",
        body: { titleId: TITLE_ID, lineIndex: 50, groupId: group.id },
      }),
      envFor(db),
    );
    expect(bobSend.status).toBe(200);

    await handleRequest(
      jsonRequest(`/api/chats/group/${group.id}/messages`, {
        method: "POST",
        token: "sess-bob",
        body: { body: "Group hello" },
      }),
      envFor(db),
    );
    const groupCarol = await handleRequest(
      jsonRequest(`/api/chats/group/${group.id}`, { token: "sess-carol" }),
      envFor(db),
    );
    const carolMsgs = (await groupCarol.json()) as {
      messages: Array<{ kind: string; body?: string }>;
    };
    expect(carolMsgs.messages.some((m) => m.kind === "text" && m.body === "Group hello")).toBe(
      true,
    );

    const list = await handleRequest(jsonRequest("/api/chats", { token: "sess-bob" }), envFor(db));
    const threads = (await list.json()) as {
      threads: Array<{ kind: string; unreadCount?: number; groupId?: string }>;
    };
    expect(threads.threads.some((t) => t.kind === "group")).toBe(true);
    expect(threads.threads.some((t) => t.kind === "dm")).toBe(true);
  });
});
