import { createId, createShareId } from "./crypto.js";
import type { User } from "./auth.js";
import { createFrozenShare } from "./shares.js";

const MIN_LINES = 3;
const MAX_LINES = 8;
const MAX_NAME = 80;
const MAX_NOTE = 140;
const MAX_CONN_LINES = 8;

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

export type AnalogyConnection = {
  id: string;
  packId: string;
  kind: "catalog";
  payload: CatalogConnectionPayload;
  note: string | null;
  proposerUserId: string;
  proposerDisplayName: string;
  createdAt: string;
  score: number;
  viewerVoted: boolean;
};

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

function displayName(email: string, displayName: string | null): string {
  return displayName ?? email.split("@")[0] ?? "player";
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
    if (row.kind !== "catalog") continue;
    let payload: CatalogConnectionPayload;
    try {
      const parsed = JSON.parse(row.payload) as CatalogConnectionPayload;
      if (typeof parsed.titleId !== "string" || !Array.isArray(parsed.lineIndices)) continue;
      const lineIndices = normalizeIndices(parsed.lineIndices);
      if (!lineIndices || lineIndices.length < 1) continue;
      payload = { titleId: parsed.titleId.trim(), lineIndices };
    } catch {
      continue;
    }
    out.push({
      id: row.id,
      packId: row.pack_id,
      kind: "catalog",
      payload,
      note: row.note,
      proposerUserId: row.proposer_user_id,
      proposerDisplayName: displayName(row.email, row.display_name),
      createdAt: row.created_at,
      score: Number(row.score) || 0,
      viewerVoted: voted.has(row.id),
    });
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
  const payload = JSON.stringify({ titleId, lineIndices });

  await db
    .prepare(
      `INSERT INTO analogy_connections
         (id, pack_id, kind, payload, note, proposer_user_id, created_at, score)
       VALUES (?, ?, 'catalog', ?, ?, ?, ?, 0)`,
    )
    .bind(id, packId, payload, note, user.id, createdAt)
    .run();

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
