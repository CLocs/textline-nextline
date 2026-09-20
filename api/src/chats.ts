import type { User } from "./auth.js";
import { areFriends, isBlocked, isValidFriendUserId, listFriends } from "./friends.js";
import { listGroups, userCanAccessGroup } from "./groups.js";

const THREAD_CAP = 50;
const MESSAGE_CAP = 100;

type ActionError = { error: string; status: number };

function publicName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : "A player";
}

export type ChatThreadSummary =
  | {
      kind: "dm";
      peerUserId: string;
      displayName: string;
      lastAt: string;
      lastPreview: string;
      lastDirection: "in" | "out";
      unreadCount: number;
    }
  | {
      kind: "group";
      groupId: string;
      name: string;
      memberCount: number;
      lastAt: string;
      lastPreview: string;
      unreadCount: number;
    };

export type DmMessage = {
  id: string;
  shareId: string;
  titleId: string;
  lineIndex: number;
  direction: "in" | "out";
  from: { userId: string; displayName: string };
  createdAt: string;
  playable: boolean;
  /** Outgoing only: peer opened the thread (their inbox read_at). */
  receipt: "sent" | "read" | null;
};

export type GroupMessage = {
  shareId: string;
  titleId: string;
  lineIndex: number;
  from: { userId: string; displayName: string };
  createdAt: string;
  sentCount: number;
  /** How many fan-out recipients have read_at set (youSent cards). */
  readCount: number;
  /** Viewer's inbox row when they were a recipient (for play + solved). */
  inboxId: string | null;
  playable: boolean;
  youSent: boolean;
};

export async function listChatThreads(
  db: D1Database,
  userId: string,
): Promise<ChatThreadSummary[]> {
  const threads: ChatThreadSummary[] = [];

  const dmRows = await db
    .prepare(
      `SELECT
         CASE WHEN sender_user_id = ? THEN recipient_user_id ELSE sender_user_id END AS peer_id,
         MAX(created_at) AS last_at
       FROM line_inbox
       WHERE group_id IS NULL
         AND (sender_user_id = ? OR recipient_user_id = ?)
       GROUP BY peer_id
       ORDER BY last_at DESC
       LIMIT ?`,
    )
    .bind(userId, userId, userId, THREAD_CAP)
    .all<{ peer_id: string; last_at: string }>();

  const friends = await listFriends(db, userId);
  const friendIds = new Set(friends.map((f) => f.userId));

  for (const row of dmRows.results ?? []) {
    if (!friendIds.has(row.peer_id)) continue;
    if (await isBlocked(db, userId, row.peer_id)) continue;

    const last = await db
      .prepare(
        `SELECT id, share_id, title_id, prompt_line_index, created_at, sender_user_id, recipient_user_id
         FROM line_inbox
         WHERE group_id IS NULL
           AND ((sender_user_id = ? AND recipient_user_id = ?)
             OR (sender_user_id = ? AND recipient_user_id = ?))
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(userId, row.peer_id, row.peer_id, userId)
      .first<{
        title_id: string;
        prompt_line_index: number;
        created_at: string;
        sender_user_id: string;
      }>();

    if (!last) continue;

    const peer = friends.find((f) => f.userId === row.peer_id);
    const unreadRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM line_inbox
         WHERE recipient_user_id = ? AND sender_user_id = ?
           AND group_id IS NULL AND read_at IS NULL`,
      )
      .bind(userId, row.peer_id)
      .first<{ n: number }>();

    threads.push({
      kind: "dm",
      peerUserId: row.peer_id,
      displayName: peer?.displayName ?? "A player",
      lastAt: last.created_at,
      lastPreview: `Line ${Number(last.prompt_line_index) + 1} · ${last.title_id}`,
      lastDirection: last.sender_user_id === userId ? "out" : "in",
      unreadCount: Number(unreadRow?.n ?? 0),
    });
  }

  const groups = await listGroups(db, userId);
  for (const group of groups) {
    const last = await db
      .prepare(
        `SELECT title_id, prompt_line_index, created_at, sender_user_id
         FROM line_inbox
         WHERE group_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(group.id)
      .first<{
        title_id: string;
        prompt_line_index: number;
        created_at: string;
        sender_user_id: string;
      }>();

    const unreadRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM line_inbox
         WHERE recipient_user_id = ? AND group_id = ? AND read_at IS NULL`,
      )
      .bind(userId, group.id)
      .first<{ n: number }>();

    const memberCount = group.members.length + 1;
    threads.push({
      kind: "group",
      groupId: group.id,
      name: group.name,
      memberCount,
      lastAt: last?.created_at ?? group.createdAt,
      lastPreview: last
        ? `Line ${Number(last.prompt_line_index) + 1} · ${last.title_id}`
        : "No messages yet",
      unreadCount: Number(unreadRow?.n ?? 0),
    });
  }

  threads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
  return threads.slice(0, THREAD_CAP);
}

export async function listDmMessages(
  db: D1Database,
  user: User,
  peerUserIdRaw: string,
): Promise<{ peer: { userId: string; displayName: string }; messages: DmMessage[] } | ActionError> {
  const peerUserId = peerUserIdRaw.trim();
  if (!isValidFriendUserId(peerUserId) || peerUserId === user.id) {
    return { error: "Invalid user", status: 400 };
  }
  if (!(await areFriends(db, user.id, peerUserId))) {
    return { error: "Not found", status: 404 };
  }
  if (await isBlocked(db, user.id, peerUserId)) {
    return { error: "Not found", status: 404 };
  }

  const peer = await db
    .prepare(`SELECT id, display_name FROM users WHERE id = ?`)
    .bind(peerUserId)
    .first<{ id: string; display_name: string | null }>();
  if (!peer) return { error: "Not found", status: 404 };

  const result = await db
    .prepare(
      `SELECT i.id, i.share_id, i.title_id, i.prompt_line_index, i.created_at,
              i.sender_user_id, i.recipient_user_id, i.read_at,
              su.display_name AS sender_name
       FROM line_inbox i
       JOIN users su ON su.id = i.sender_user_id
       WHERE i.group_id IS NULL
         AND ((i.sender_user_id = ? AND i.recipient_user_id = ?)
           OR (i.sender_user_id = ? AND i.recipient_user_id = ?))
       ORDER BY i.created_at ASC
       LIMIT ?`,
    )
    .bind(user.id, peerUserId, peerUserId, user.id, MESSAGE_CAP)
    .all<{
      id: string;
      share_id: string;
      title_id: string;
      prompt_line_index: number;
      created_at: string;
      sender_user_id: string;
      recipient_user_id: string;
      read_at: string | null;
      sender_name: string | null;
    }>();

  const messages = (result.results ?? []).map((row) => {
    const direction: "in" | "out" = row.sender_user_id === user.id ? "out" : "in";
    return {
      id: row.id,
      shareId: row.share_id,
      titleId: row.title_id,
      lineIndex: Number(row.prompt_line_index),
      direction,
      from: {
        userId: row.sender_user_id,
        displayName: publicName(row.sender_name),
      },
      createdAt: row.created_at,
      playable: direction === "in",
      // Outgoing row is the peer's inbox copy — read_at means they opened the thread.
      receipt: direction === "out" ? (row.read_at ? ("read" as const) : ("sent" as const)) : null,
    };
  });

  return {
    peer: { userId: peer.id, displayName: publicName(peer.display_name) },
    messages,
  };
}

export async function listGroupMessages(
  db: D1Database,
  user: User,
  groupIdRaw: string,
): Promise<{ name: string; messages: GroupMessage[] } | ActionError> {
  const groupId = groupIdRaw.trim();
  if (!isValidFriendUserId(groupId)) return { error: "Invalid group", status: 400 };
  const group = await userCanAccessGroup(db, groupId, user.id);
  if (!group) return { error: "Not found", status: 404 };

  const result = await db
    .prepare(
      `SELECT i.id, i.share_id, i.title_id, i.prompt_line_index, i.created_at,
              i.sender_user_id, i.recipient_user_id, i.read_at,
              su.display_name AS sender_name
       FROM line_inbox i
       JOIN users su ON su.id = i.sender_user_id
       WHERE i.group_id = ?
       ORDER BY i.created_at ASC
       LIMIT ?`,
    )
    .bind(groupId, MESSAGE_CAP * 20)
    .all<{
      id: string;
      share_id: string;
      title_id: string;
      prompt_line_index: number;
      created_at: string;
      sender_user_id: string;
      recipient_user_id: string;
      read_at: string | null;
      sender_name: string | null;
    }>();

  type Acc = {
    shareId: string;
    titleId: string;
    lineIndex: number;
    from: { userId: string; displayName: string };
    createdAt: string;
    sentCount: number;
    readCount: number;
    inboxId: string | null;
    youSent: boolean;
  };

  const byShare = new Map<string, Acc>();
  for (const row of result.results ?? []) {
    let acc = byShare.get(row.share_id);
    if (!acc) {
      acc = {
        shareId: row.share_id,
        titleId: row.title_id,
        lineIndex: Number(row.prompt_line_index),
        from: {
          userId: row.sender_user_id,
          displayName: publicName(row.sender_name),
        },
        createdAt: row.created_at,
        sentCount: 0,
        readCount: 0,
        inboxId: null,
        youSent: row.sender_user_id === user.id,
      };
      byShare.set(row.share_id, acc);
    }
    acc.sentCount += 1;
    if (row.read_at) acc.readCount += 1;
    if (row.recipient_user_id === user.id) {
      acc.inboxId = row.id;
    }
    if (row.created_at < acc.createdAt) acc.createdAt = row.created_at;
  }

  const messages = [...byShare.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .slice(-MESSAGE_CAP)
    .map((acc) => ({
      shareId: acc.shareId,
      titleId: acc.titleId,
      lineIndex: acc.lineIndex,
      from: acc.from,
      createdAt: acc.createdAt,
      sentCount: acc.sentCount,
      readCount: acc.readCount,
      inboxId: acc.inboxId,
      playable: Boolean(acc.inboxId) && !acc.youSent,
      youSent: acc.youSent,
    }));

  return { name: group.name, messages };
}

export async function markDmRead(
  db: D1Database,
  user: User,
  peerUserIdRaw: string,
): Promise<{ ok: true } | ActionError> {
  const peerUserId = peerUserIdRaw.trim();
  if (!isValidFriendUserId(peerUserId)) return { error: "Invalid user", status: 400 };
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE line_inbox SET read_at = ?
       WHERE recipient_user_id = ? AND sender_user_id = ?
         AND group_id IS NULL AND read_at IS NULL`,
    )
    .bind(now, user.id, peerUserId)
    .run();
  return { ok: true };
}

export async function markGroupRead(
  db: D1Database,
  user: User,
  groupIdRaw: string,
): Promise<{ ok: true } | ActionError> {
  const groupId = groupIdRaw.trim();
  if (!isValidFriendUserId(groupId)) return { error: "Invalid group", status: 400 };
  const group = await userCanAccessGroup(db, groupId, user.id);
  if (!group) return { error: "Not found", status: 404 };
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE line_inbox SET read_at = ?
       WHERE recipient_user_id = ? AND group_id = ? AND read_at IS NULL`,
    )
    .bind(now, user.id, groupId)
    .run();
  return { ok: true };
}
