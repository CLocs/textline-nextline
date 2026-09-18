import { describe, expect, it } from "vitest";
import { handleRequest } from "../api/src/index.js";
import { canonicalPair } from "../api/src/friends.js";

const ALICE_ID = "11111111-1111-4111-8111-111111111111";
const BOB_ID = "22222222-2222-4222-8222-222222222222";
const ORIGIN = "http://localhost:5173";
const TITLE_ID = "the-wolf-of-wall-street-2013";

type UserRow = { id: string; email: string; display_name: string | null; created_at: string };
type SessionRow = { id: string; user_id: string; expires_at: string };
type FriendshipRow = { user_a: string; user_b: string; created_at: string };
type BlockRow = { blocker_user_id: string; blocked_user_id: string; created_at: string };
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

function createInboxDb(options?: { friends?: boolean; blocked?: boolean }) {
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
  const pair = canonicalPair(ALICE_ID, BOB_ID);
  const friendships: FriendshipRow[] = options?.friends
    ? [{ user_a: pair.userA, user_b: pair.userB, created_at: "2026-01-02T00:00:00.000Z" }]
    : [];
  const blocks: BlockRow[] = options?.blocked
    ? [{ blocker_user_id: BOB_ID, blocked_user_id: ALICE_ID, created_at: "2026-01-03T00:00:00.000Z" }]
    : [];
  const shares: ShareRow[] = [];
  const inbox: InboxRow[] = [];

  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              if (sql.includes("INSERT INTO mini_shares")) {
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
              if (sql.includes("FROM mini_shares WHERE owner_user_id")) {
                const [userId] = args as [string];
                const rows = shares.filter((share) => share.owner_user_id === userId);
                const last = rows[rows.length - 1];
                return (last ? { created_at: last.created_at } : null) as T;
              }
              if (sql.includes("FROM mini_shares WHERE id")) {
                const [shareId] = args as [string];
                const share = shares.find((row) => row.id === shareId);
                return (share
                  ? {
                      title_id: share.title_id,
                      owner_user_id: share.owner_user_id,
                      revoked_at: null,
                      line_indices: share.line_indices,
                    }
                  : null) as T;
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
              return { results: [] as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db };
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

describe("inbox API", () => {
  it("copies a frozen one-line play link", async () => {
    const { db } = createInboxDb();
    const created = await handleRequest(
      jsonRequest("/api/inbox/share", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27 },
      }),
      envFor(db),
    );
    expect(created.status).toBe(200);
    const payload = (await created.json()) as { shareId: string; url: string };
    expect(payload.url).toMatch(/#\/play\/[a-f0-9]{24}$/);

    const queue = await handleRequest(
      jsonRequest(`/api/shares/${payload.shareId}/queue`, { token: "sess-bob" }),
      envFor(db),
    );
    expect(queue.status).toBe(200);
    const body = (await queue.json()) as { titleId: string; lineIndices: number[]; frozen: boolean };
    expect(body).toEqual({ titleId: TITLE_ID, lineIndices: [27], frozen: true });
  });

  it("sends only to friends and never lists emails", async () => {
    const stranger = createInboxDb();
    const denied = await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27, toUserId: BOB_ID },
      }),
      envFor(stranger.db),
    );
    expect(denied.status).toBe(403);

    const { db } = createInboxDb({ friends: true });
    const sent = await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27, toUserId: BOB_ID },
      }),
      envFor(db),
    );
    expect(sent.status).toBe(200);

    const list = await handleRequest(jsonRequest("/api/inbox", { token: "sess-bob" }), envFor(db));
    const data = (await list.json()) as {
      items: Array<{ from: { displayName: string; userId: string }; titleId: string; lineIndex: number }>;
    };
    expect(data.items).toHaveLength(1);
    expect(data.items[0]).toMatchObject({
      titleId: TITLE_ID,
      lineIndex: 27,
      from: { userId: ALICE_ID, displayName: "Alice" },
    });
    expect(JSON.stringify(data)).not.toContain("@example.com");
  });

  it("rejects a send after a block", async () => {
    const { db } = createInboxDb({ friends: true, blocked: true });
    const sent = await handleRequest(
      jsonRequest("/api/inbox", {
        method: "POST",
        token: "sess-alice",
        body: { titleId: TITLE_ID, lineIndex: 27, toUserId: BOB_ID },
      }),
      envFor(db),
    );
    expect(sent.status).toBe(403);
  });
});
