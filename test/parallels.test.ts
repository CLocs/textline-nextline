import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  createAnalogyPack,
  listAnalogyConnections,
  proposeCatalogConnection,
  upvoteConnection,
} from "../api/src/parallels.js";
import type { User } from "../api/src/auth.js";

type PackRow = {
  id: string;
  owner_user_id: string;
  title_id: string;
  line_indices: string;
  share_id: string;
  name: string;
  created_at: string;
};
type ConnRow = {
  id: string;
  pack_id: string;
  kind: string;
  payload: string;
  note: string | null;
  proposer_user_id: string;
  created_at: string;
  score: number;
};
type VoteRow = { connection_id: string; user_id: string; value: number; created_at: string };
type ShareRow = {
  id: string;
  owner_user_id: string;
  title_id: string;
  created_at: string;
  revoked_at: string | null;
  line_indices: string | null;
};
type UserRow = { id: string; email: string; display_name: string | null };

function createDb() {
  const packs: PackRow[] = [];
  const connections: ConnRow[] = [];
  const votes: VoteRow[] = [];
  const shares: ShareRow[] = [];
  const users: UserRow[] = [
    { id: "u1", email: "a@example.com", display_name: "Ada" },
    { id: "u2", email: "b@example.com", display_name: "Bob" },
  ];

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
                  revoked_at: null,
                  line_indices: lineIndices,
                });
              } else if (sql.includes("INSERT INTO analogy_packs")) {
                const [id, owner, titleId, lineIndices, shareId, name, createdAt] = args as [
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                  string,
                ];
                packs.push({
                  id,
                  owner_user_id: owner,
                  title_id: titleId,
                  line_indices: lineIndices,
                  share_id: shareId,
                  name,
                  created_at: createdAt,
                });
              } else if (sql.includes("INSERT INTO analogy_connections")) {
                const [id, packId, payload, note, proposer, createdAt] = args as [
                  string,
                  string,
                  string,
                  string | null,
                  string,
                  string,
                ];
                connections.push({
                  id,
                  pack_id: packId,
                  kind: "catalog",
                  payload,
                  note,
                  proposer_user_id: proposer,
                  created_at: createdAt,
                  score: 0,
                });
              } else if (sql.includes("INSERT INTO analogy_votes")) {
                const [connectionId, userId, value, createdAt] = args as [
                  string,
                  string,
                  number,
                  string,
                ];
                votes.push({
                  connection_id: connectionId,
                  user_id: userId,
                  value,
                  created_at: createdAt,
                });
              } else if (sql.includes("UPDATE analogy_connections SET score")) {
                const [id] = args as [string];
                const row = connections.find((c) => c.id === id);
                if (row) row.score += 1;
              }
            },
            async first() {
              if (sql.includes("FROM analogy_packs") && sql.includes("WHERE p.id")) {
                const [id] = args as [string];
                const pack = packs.find((p) => p.id === id);
                if (!pack) return null;
                const u = users.find((x) => x.id === pack.owner_user_id)!;
                return {
                  ...pack,
                  email: u.email,
                  display_name: u.display_name,
                };
              }
              if (sql.includes("FROM analogy_connections WHERE id")) {
                const [id] = args as [string];
                const row = connections.find((c) => c.id === id);
                return row ? { id: row.id, score: row.score } : null;
              }
              if (sql.includes("FROM analogy_votes WHERE connection_id")) {
                const [connectionId, userId] = args as [string, string];
                const row = votes.find(
                  (v) => v.connection_id === connectionId && v.user_id === userId,
                );
                return row ? { value: row.value } : null;
              }
              return null;
            },
            async all() {
              if (sql.includes("FROM analogy_connections c")) {
                const [packId] = args as [string];
                return {
                  results: connections
                    .filter((c) => c.pack_id === packId)
                    .map((c) => {
                      const u = users.find((x) => x.id === c.proposer_user_id)!;
                      return {
                        ...c,
                        email: u.email,
                        display_name: u.display_name,
                      };
                    }),
                };
              }
              if (sql.includes("FROM analogy_votes")) {
                const userId = args[0] as string;
                const ids = args.slice(1) as string[];
                return {
                  results: votes
                    .filter((v) => v.user_id === userId && ids.includes(v.connection_id))
                    .map((v) => ({ connection_id: v.connection_id })),
                };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, packs, connections, votes, shares };
}

const ada: User = {
  id: "u1",
  email: "a@example.com",
  displayName: "Ada",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const bob: User = {
  id: "u2",
  email: "b@example.com",
  displayName: "Bob",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("quote parallels (Light)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pack with a frozen share", async () => {
    const { db, packs, shares } = createDb();
    const result = await createAnalogyPack(db, ada, {
      titleId: "the-wolf-of-wall-street-2013",
      lineIndices: [100, 101, 102],
      name: "Not fucking real",
    });
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.name).toBe("Not fucking real");
    expect(result.lineIndices).toEqual([100, 101, 102]);
    expect(packs).toHaveLength(1);
    expect(shares).toHaveLength(1);
    expect(shares[0]!.line_indices).toBe(JSON.stringify([100, 101, 102]));
  });

  it("rejects packs outside 3–8 lines", async () => {
    const { db } = createDb();
    const result = await createAnalogyPack(db, ada, {
      titleId: "x",
      lineIndices: [1, 2],
      name: "Too short",
    });
    expect(result).toMatchObject({ status: 400 });
  });

  it("proposes a catalog connection and upvotes once", async () => {
    const { db } = createDb();
    const pack = await createAnalogyPack(db, ada, {
      titleId: "the-wolf-of-wall-street-2013",
      lineIndices: [100, 101, 102],
      name: "Not fucking real",
    });
    if ("error" in pack) throw new Error(pack.error);

    const conn = await proposeCatalogConnection(db, bob, pack.id, {
      titleId: "matrix-1999",
      lineIndices: [541],
      note: "Same energy",
    });
    expect("error" in conn).toBe(false);
    if ("error" in conn) return;

    const first = await upvoteConnection(db, ada, conn.id);
    expect(first).toEqual({ score: 1, viewerVoted: true });
    const second = await upvoteConnection(db, ada, conn.id);
    expect(second).toEqual({ score: 1, viewerVoted: true });

    const listed = await listAnalogyConnections(db, pack.id, ada.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.score).toBe(1);
    expect(listed[0]!.viewerVoted).toBe(true);
    expect(listed[0]!.payload.titleId).toBe("matrix-1999");
  });
});
