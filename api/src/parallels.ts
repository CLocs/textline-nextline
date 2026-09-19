import { createId, createShareId } from "./crypto.js";
import type { User } from "./auth.js";
import { createFrozenShare } from "./shares.js";
import { areFriends, isBlocked, isValidFriendUserId } from "./friends.js";
import { listGroupMemberIds } from "./groups.js";

const MIN_LINES = 3;
/** Room for a full scene (e.g. Wolf lunch), not just a short beat. */
const MAX_LINES = 500;
const MAX_NAME = 80;
const MAX_NOTE = 140;
const MAX_CONN_LINES = 500;
const MAX_CONTEXT = 80;
const MAX_REWRITE = 12000;

export type AnalogyPack = {
  id: string;
  ownerUserId: string;
  ownerDisplayName: string;
  titleId: string;
  lineIndices: number[];
  shareId: string;
  name: string;
  createdAt: string;
};

export type CatalogConnectionPayload = {
  titleId: string;
  lineIndices: number[];
};

export type RewriteSentTo = {
  people: { userId: string; displayName: string }[];
  groups: { id: string; name: string }[];
};

export type RewriteConnectionPayload = {
  context: string;
  text: string;
  sentTo?: RewriteSentTo;
};

type ConnectionBase = {
  id: string;
  packId: string;
  note: string | null;
  proposerUserId: string;
  proposerDisplayName: string;
  createdAt: string;
  score: number;
  viewerVoted: boolean;
};

export type AnalogyConnection =
  | (ConnectionBase & { kind: "catalog"; payload: CatalogConnectionPayload })
  | (ConnectionBase & { kind: "rewrite"; payload: RewriteConnectionPayload });

function decodeIndices(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0);
  } catch {
    return [];
  }
}

function normalizeIndices(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  const seen = new Set<number>();
  for (const item of raw) {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0) return null;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function normalizeName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > MAX_NAME) return null;
  return name;
}

function normalizeNote(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return null;
  const note = raw.trim().replace(/\s+/g, " ");
  if (note.length > MAX_NOTE) return null;
  return note || null;
}

function normalizeContext(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const context = raw.trim().replace(/\s+/g, " ");
  if (context.length < 1 || context.length > MAX_CONTEXT) return null;
  return context;
}

function normalizeRewrite(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  if (text.length < 1 || text.length > MAX_REWRITE) return null;
  return text;
}

function parseSentTo(raw: unknown): RewriteSentTo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as { people?: unknown; groups?: unknown };
  const people = Array.isArray(rec.people)
    ? rec.people.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { userId?: unknown; displayName?: unknown };
        if (typeof row.userId !== "string" || typeof row.displayName !== "string") return [];
        return [{ userId: row.userId, displayName: row.displayName }];
      })
    : [];
  const groups = Array.isArray(rec.groups)
    ? rec.groups.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { id?: unknown; name?: unknown };
        if (typeof row.id !== "string" || typeof row.name !== "string") return [];
        return [{ id: row.id, name: row.name }];
      })
    : [];
  if (people.length === 0 && groups.length === 0) return undefined;
  return { people, groups };
}

function normalizeIdList(raw: unknown, max: number): string[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" || !isValidFriendUserId(item)) return null;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length > max) return null;
  }
  return out;
}

function displayName(email: string, displayName: string | null): string {
  return displayName ?? email.split("@")[0] ?? "player";
}

async function insertConnection(
  db: D1Database,
  row: {
    id: string;
    packId: string;
    kind: "catalog" | "rewrite";
    payload: string;
    note: string | null;
    proposerUserId: string;
    createdAt: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO analogy_connections
         (id, pack_id, kind, payload, note, proposer_user_id, created_at, score)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .bind(row.id, row.packId, row.kind, row.payload, row.note, row.proposerUserId, row.createdAt)
    .run();
}

function parseStoredConnection(
  row: {
    id: string;
    pack_id: string;
    kind: string;
    payload: string;
    note: string | null;
    proposer_user_id: string;
    created_at: string;
    score: number;
    email: string;
    display_name: string | null;
  },
  viewerVoted: boolean,
): AnalogyConnection | null {
  const base = {
    id: row.id,
    packId: row.pack_id,
    note: row.note,
    proposerUserId: row.proposer_user_id,
    proposerDisplayName: displayName(row.email, row.display_name),
    createdAt: row.created_at,
    score: Number(row.score) || 0,
    viewerVoted,
  };

  try {
    const parsed = JSON.parse(row.payload) as unknown;
    if (row.kind === "rewrite") {
      if (!parsed || typeof parsed !== "object") return null;
      const rec = parsed as { context?: unknown; text?: unknown; sentTo?: unknown };
      const context = typeof rec.context === "string" ? rec.context.trim() : "";
      const text = typeof rec.text === "string" ? rec.text.trim() : "";
      if (!text) return null;
      return { ...base, kind: "rewrite", payload: { context, text, sentTo: parseSentTo(rec.sentTo) } };
    }
    if (row.kind !== "catalog" || !parsed || typeof parsed !== "object") return null;
    const rec = parsed as CatalogConnectionPayload;
    if (typeof rec.titleId !== "string" || !Array.isArray(rec.lineIndices)) return null;
    const lineIndices = normalizeIndices(rec.lineIndices);
    if (!lineIndices || lineIndices.length < 1) return null;
    return {
      ...base,
      kind: "catalog",
      payload: { titleId: rec.titleId.trim(), lineIndices },
    };
  } catch {
    return null;
  }
}

export async function createAnalogyPack(
  db: D1Database,
  owner: User,
  body: { titleId?: string; lineIndices?: unknown; name?: unknown },
): Promise<AnalogyPack | { error: string; status: number }> {
  const titleId = typeof body.titleId === "string" ? body.titleId.trim() : "";
  if (!titleId) return { error: "Missing titleId", status: 400 };

  const lineIndices = normalizeIndices(body.lineIndices);
  if (!lineIndices || lineIndices.length < MIN_LINES || lineIndices.length > MAX_LINES) {
    return { error: `Pick ${MIN_LINES}–${MAX_LINES} lines`, status: 400 };
  }

  const name = normalizeName(body.name);
  if (!name) return { error: "Name must be 1–80 characters", status: 400 };

  const share = await createFrozenShare(db, owner, titleId, lineIndices);
  const id = createShareId();
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO analogy_packs
         (id, owner_user_id, title_id, line_indices, share_id, name, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, owner.id, titleId, JSON.stringify(lineIndices), share.id, name, createdAt)
    .run();

  return {
    id,
    ownerUserId: owner.id,
    ownerDisplayName: displayName(owner.email, owner.displayName),
    titleId,
    lineIndices,
    shareId: share.id,
    name,
    createdAt,
  };
}

export async function listMyAnalogyPacks(
  db: D1Database,
  userId: string,
): Promise<AnalogyPack[]> {
  const result = await db
    .prepare(
      `SELECT p.id, p.owner_user_id, p.title_id, p.line_indices, p.share_id, p.name, p.created_at,
              u.email, u.display_name
       FROM analogy_packs p
       JOIN users u ON u.id = p.owner_user_id
       WHERE p.owner_user_id = ?
       ORDER BY p.created_at DESC
       LIMIT 50`,
    )
    .bind(userId)
    .all<{
      id: string;
      owner_user_id: string;
      title_id: string;
      line_indices: string;
      share_id: string;
      name: string;
      created_at: string;
      email: string;
      display_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: displayName(row.email, row.display_name),
    titleId: row.title_id,
    lineIndices: decodeIndices(row.line_indices),
    shareId: row.share_id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

export async function getAnalogyPack(
  db: D1Database,
  packId: string,
): Promise<AnalogyPack | null> {
  const row = await db
    .prepare(
      `SELECT p.id, p.owner_user_id, p.title_id, p.line_indices, p.share_id, p.name, p.created_at,
              u.email, u.display_name
       FROM analogy_packs p
       JOIN users u ON u.id = p.owner_user_id
       WHERE p.id = ?`,
    )
    .bind(packId)
    .first<{
      id: string;
      owner_user_id: string;
      title_id: string;
      line_indices: string;
      share_id: string;
      name: string;
      created_at: string;
      email: string;
      display_name: string | null;
    }>();

  if (!row) return null;
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    ownerDisplayName: displayName(row.email, row.display_name),
    titleId: row.title_id,
    lineIndices: decodeIndices(row.line_indices),
    shareId: row.share_id,
    name: row.name,
    createdAt: row.created_at,
  };
}

export async function listAnalogyConnections(
  db: D1Database,
  packId: string,
  viewerUserId: string | null,
): Promise<AnalogyConnection[]> {
  const result = await db
    .prepare(
      `SELECT c.id, c.pack_id, c.kind, c.payload, c.note, c.proposer_user_id, c.created_at, c.score,
              u.email, u.display_name
       FROM analogy_connections c
       JOIN users u ON u.id = c.proposer_user_id
       WHERE c.pack_id = ?
       ORDER BY c.score DESC, c.created_at DESC
       LIMIT 100`,
    )
    .bind(packId)
    .all<{
      id: string;
      pack_id: string;
      kind: string;
      payload: string;
      note: string | null;
      proposer_user_id: string;
      created_at: string;
      score: number;
      email: string;
      display_name: string | null;
    }>();

  const rows = result.results ?? [];
  const voted = new Set<string>();
  if (viewerUserId && rows.length > 0) {
    const votes = await db
      .prepare(
        `SELECT connection_id FROM analogy_votes
         WHERE user_id = ? AND connection_id IN (${rows.map(() => "?").join(",")})`,
      )
      .bind(viewerUserId, ...rows.map((r) => r.id))
      .all<{ connection_id: string }>();
    for (const v of votes.results ?? []) voted.add(v.connection_id);
  }

  const out: AnalogyConnection[] = [];
  for (const row of rows) {
    const parsed = parseStoredConnection(row, voted.has(row.id));
    if (parsed) out.push(parsed);
  }
  return out;
}

export async function proposeCatalogConnection(
  db: D1Database,
  user: User,
  packId: string,
  body: { titleId?: string; lineIndices?: unknown; note?: unknown },
): Promise<AnalogyConnection | { error: string; status: number }> {
  const pack = await getAnalogyPack(db, packId);
  if (!pack) return { error: "Pack not found", status: 404 };

  const titleId = typeof body.titleId === "string" ? body.titleId.trim() : "";
  if (!titleId) return { error: "Missing titleId", status: 400 };

  const lineIndices = normalizeIndices(body.lineIndices);
  if (!lineIndices || lineIndices.length < 1 || lineIndices.length > MAX_CONN_LINES) {
    return { error: `Connection needs 1–${MAX_CONN_LINES} lines`, status: 400 };
  }

  const note = normalizeNote(body.note);
  if (body.note !== undefined && body.note !== null && body.note !== "" && note === null) {
    return { error: "Note must be ≤140 characters", status: 400 };
  }

  const id = createId();
  const createdAt = new Date().toISOString();
  await insertConnection(db, {
    id,
    packId,
    kind: "catalog",
    payload: JSON.stringify({ titleId, lineIndices }),
    note,
    proposerUserId: user.id,
    createdAt,
  });

  return {
    id,
    packId,
    kind: "catalog",
    payload: { titleId, lineIndices },
    note,
    proposerUserId: user.id,
    proposerDisplayName: displayName(user.email, user.displayName),
    createdAt,
    score: 0,
    viewerVoted: false,
  };
}

export async function proposeRewriteConnection(
  db: D1Database,
  user: User,
  packId: string,
  body: { context?: unknown; text?: unknown; toUserIds?: unknown; toGroupIds?: unknown },
): Promise<AnalogyConnection | { error: string; status: number }> {
  const pack = await getAnalogyPack(db, packId);
  if (!pack) return { error: "Pack not found", status: 404 };

  const context = normalizeContext(body.context);
  if (!context) return { error: `Context must be 1–${MAX_CONTEXT} characters`, status: 400 };

  const text = normalizeRewrite(body.text);
  if (!text) return { error: `Parallel must be 1–${MAX_REWRITE} characters`, status: 400 };

  const toUserIds = normalizeIdList(body.toUserIds, 50);
  const toGroupIds = normalizeIdList(body.toGroupIds, 10);
  if (!toUserIds || !toGroupIds) return { error: "Invalid send-to list", status: 400 };

  const sentTo = await resolveRewriteRecipients(db, user, toUserIds, toGroupIds);
  if ("error" in sentTo) return sentTo;

  const id = createId();
  const createdAt = new Date().toISOString();
  const payload: RewriteConnectionPayload = { context, text };
  if (sentTo.people.length > 0 || sentTo.groups.length > 0) payload.sentTo = sentTo;

  await insertConnection(db, {
    id,
    packId,
    kind: "rewrite",
    payload: JSON.stringify(payload),
    note: null,
    proposerUserId: user.id,
    createdAt,
  });

  for (const person of sentTo.people) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO parallel_inbox
           (id, connection_id, pack_id, sender_user_id, recipient_user_id, group_id, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      )
      .bind(createId(), id, packId, user.id, person.userId, createdAt)
      .run();
  }
  for (const group of sentTo.groups) {
    const memberIds = await listGroupMemberIds(db, group.id);
    for (const memberId of memberIds) {
      if (memberId === user.id) continue;
      if (!(await areFriends(db, user.id, memberId))) continue;
      if (await isBlocked(db, user.id, memberId)) continue;
      await db
        .prepare(
          `INSERT OR IGNORE INTO parallel_inbox
             (id, connection_id, pack_id, sender_user_id, recipient_user_id, group_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(createId(), id, packId, user.id, memberId, group.id, createdAt)
        .run();
    }
  }

  return {
    id,
    packId,
    kind: "rewrite",
    payload,
    note: null,
    proposerUserId: user.id,
    proposerDisplayName: displayName(user.email, user.displayName),
    createdAt,
    score: 0,
    viewerVoted: false,
  };
}

async function resolveRewriteRecipients(
  db: D1Database,
  user: User,
  toUserIds: string[],
  toGroupIds: string[],
): Promise<RewriteSentTo | { error: string; status: number }> {
  const people: RewriteSentTo["people"] = [];
  for (const toUserId of toUserIds) {
    if (toUserId === user.id) return { error: "Can't send to yourself", status: 400 };
    if (!(await areFriends(db, user.id, toUserId))) {
      return { error: "You can only send to friends", status: 403 };
    }
    if (await isBlocked(db, user.id, toUserId)) {
      return { error: "Can't send to this person", status: 403 };
    }
    const row = await db
      .prepare(`SELECT display_name FROM users WHERE id = ?`)
      .bind(toUserId)
      .first<{ display_name: string | null }>();
    people.push({
      userId: toUserId,
      displayName: row?.display_name?.trim() || "A player",
    });
  }

  const groups: RewriteSentTo["groups"] = [];
  for (const groupId of toGroupIds) {
    const group = await db
      .prepare(`SELECT id, name FROM friend_groups WHERE id = ? AND owner_user_id = ?`)
      .bind(groupId, user.id)
      .first<{ id: string; name: string }>();
    if (!group) return { error: "Group not found", status: 404 };
    groups.push({ id: group.id, name: group.name });
  }

  return { people, groups };
}

export type ParallelInboxItem = {
  id: string;
  packId: string;
  connectionId: string;
  packName: string;
  context: string;
  text: string;
  from: { userId: string; displayName: string };
  createdAt: string;
};

export async function listParallelInbox(db: D1Database, userId: string): Promise<ParallelInboxItem[]> {
  const result = await db
    .prepare(
      `SELECT i.id, i.pack_id, i.connection_id, i.created_at,
              p.name AS pack_name, c.payload,
              u.id AS sender_id, u.display_name
       FROM parallel_inbox i
       JOIN analogy_packs p ON p.id = i.pack_id
       JOIN analogy_connections c ON c.id = i.connection_id
       JOIN users u ON u.id = i.sender_user_id
       WHERE i.recipient_user_id = ?
       ORDER BY i.created_at DESC
       LIMIT 50`,
    )
    .bind(userId)
    .all<{
      id: string;
      pack_id: string;
      connection_id: string;
      created_at: string;
      pack_name: string;
      payload: string;
      sender_id: string;
      display_name: string | null;
    }>();

  return (result.results ?? []).flatMap((row) => {
    try {
      const parsed = JSON.parse(row.payload) as { context?: unknown; text?: unknown };
      const context = typeof parsed.context === "string" ? parsed.context.trim() : "";
      const text = typeof parsed.text === "string" ? parsed.text.trim() : "";
      if (!text) return [];
      return [
        {
          id: row.id,
          packId: row.pack_id,
          connectionId: row.connection_id,
          packName: row.pack_name,
          context,
          text,
          from: {
            userId: row.sender_id,
            displayName: row.display_name?.trim() || "A player",
          },
          createdAt: row.created_at,
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function upvoteConnection(
  db: D1Database,
  user: User,
  connectionId: string,
): Promise<{ score: number; viewerVoted: true } | { error: string; status: number }> {
  const row = await db
    .prepare(`SELECT id, score FROM analogy_connections WHERE id = ?`)
    .bind(connectionId)
    .first<{ id: string; score: number }>();
  if (!row) return { error: "Connection not found", status: 404 };

  const existing = await db
    .prepare(`SELECT value FROM analogy_votes WHERE connection_id = ? AND user_id = ?`)
    .bind(connectionId, user.id)
    .first<{ value: number }>();

  if (existing) {
    return { score: Number(row.score) || 0, viewerVoted: true };
  }

  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO analogy_votes (connection_id, user_id, value, created_at)
       VALUES (?, ?, 1, ?)`,
    )
    .bind(connectionId, user.id, createdAt)
    .run();
  await db
    .prepare(`UPDATE analogy_connections SET score = score + 1 WHERE id = ?`)
    .bind(connectionId)
    .run();

  return { score: (Number(row.score) || 0) + 1, viewerVoted: true };
}
