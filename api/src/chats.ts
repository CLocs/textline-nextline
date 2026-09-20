import type { User } from "./auth.js";
import { createId } from "./crypto.js";
import { areFriends, canonicalPair, isBlocked, isValidFriendUserId, listFriends } from "./friends.js";
import { listGroups, userCanAccessGroup } from "./groups.js";

const THREAD_CAP = 50;
const MESSAGE_CAP = 100;
const BODY_MAX = 1000;
export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🔥"] as const;
export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

type ActionError = { error: string; status: number };

export type ChatReaction = {
  emoji: string;
  count: number;
  reacted: boolean;
};

function isAllowedEmoji(raw: unknown): raw is ChatReactionEmoji {
  return typeof raw === "string" && (CHAT_REACTION_EMOJIS as readonly string[]).includes(raw);
}

function reactionKey(kind: "text" | "quote", id: string): string {
  return `${kind}:${id}`;
}

async function loadReactionsMap(
  db: D1Database,
  viewerId: string,
  targets: Array<{ kind: "text" | "quote"; id: string }>,
): Promise<Map<string, ChatReaction[]>> {
  const map = new Map<string, ChatReaction[]>();
  if (targets.length === 0) return map;

  const textIds = [...new Set(targets.filter((t) => t.kind === "text").map((t) => t.id))];
  const quoteIds = [...new Set(targets.filter((t) => t.kind === "quote").map((t) => t.id))];
  const rows: Array<{
    target_kind: string;
    target_id: string;
    emoji: string;
    user_id: string;
  }> = [];

  async function fetchKind(kind: "text" | "quote", ids: string[]) {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    const result = await db
      .prepare(
        `SELECT target_kind, target_id, emoji, user_id
         FROM chat_reactions
         WHERE target_kind = ? AND target_id IN (${placeholders})`,
      )
      .bind(kind, ...ids)
      .all<{ target_kind: string; target_id: string; emoji: string; user_id: string }>();
    rows.push(...(result.results ?? []));
  }

  await fetchKind("text", textIds);
  await fetchKind("quote", quoteIds);

  type Acc = { count: number; reacted: boolean };
  const nested = new Map<string, Map<string, Acc>>();
  for (const row of rows) {
    const key = reactionKey(row.target_kind as "text" | "quote", row.target_id);
    let byEmoji = nested.get(key);
    if (!byEmoji) {
      byEmoji = new Map();
      nested.set(key, byEmoji);
    }
    let acc = byEmoji.get(row.emoji);
    if (!acc) {
      acc = { count: 0, reacted: false };
      byEmoji.set(row.emoji, acc);
    }
    acc.count += 1;
    if (row.user_id === viewerId) acc.reacted = true;
  }

  for (const [key, byEmoji] of nested) {
    const list = [...byEmoji.entries()]
      .map(([emoji, acc]) => ({ emoji, count: acc.count, reacted: acc.reacted }))
      .sort((a, b) => a.emoji.localeCompare(b.emoji));
    map.set(key, list);
  }
  return map;
}

function attachReactions<T extends { kind: "text" | "quote" }>(
  messages: T[],
  reactionMap: Map<string, ChatReaction[]>,
  idFor: (message: T) => string,
): Array<T & { reactions: ChatReaction[] }> {
  return messages.map((message) => ({
    ...message,
    reactions: reactionMap.get(reactionKey(message.kind, idFor(message))) ?? [],
  }));
}

function publicName(displayName: string | null | undefined): string {
  const trimmed = displayName?.trim();
  return trimmed ? trimmed : "A player";
}

function dmThreadKey(a: string, b: string): string {
  const pair = canonicalPair(a, b);
  return `dm:${pair.userA}:${pair.userB}`;
}

function groupThreadKey(groupId: string): string {
  return `group:${groupId}`;
}

function truncatePreview(body: string, max = 80): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}

function normalizeBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().replace(/\r\n/g, "\n");
  if (!trimmed || trimmed.length > BODY_MAX) return null;
  return trimmed;
}

async function upsertThreadRead(
  db: D1Database,
  userId: string,
  threadKey: string,
  at: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO chat_thread_reads (user_id, thread_key, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, thread_key) DO UPDATE SET last_read_at = excluded.last_read_at`,
    )
    .bind(userId, threadKey, at)
    .run();
}

async function textUnreadCount(
  db: D1Database,
  userId: string,
  threadKey: string,
  dmPair: { userA: string; userB: string } | null,
  groupId: string | null,
): Promise<number> {
  const readRow = await db
    .prepare(
      `SELECT last_read_at FROM chat_thread_reads WHERE user_id = ? AND thread_key = ?`,
    )
    .bind(userId, threadKey)
    .first<{ last_read_at: string }>();
  const since = readRow?.last_read_at ?? "1970-01-01T00:00:00.000Z";

  if (groupId) {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM chat_messages
         WHERE group_id = ? AND sender_user_id != ? AND created_at > ?`,
      )
      .bind(groupId, userId, since)
      .first<{ n: number }>();
    return Number(row?.n ?? 0);
  }

  if (!dmPair) return 0;
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM chat_messages
       WHERE dm_user_a = ? AND dm_user_b = ?
         AND sender_user_id != ? AND created_at > ?`,
    )
    .bind(dmPair.userA, dmPair.userB, userId, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

export type ChatThreadSummary =
  | {
      kind: "dm";
      peerUserId: string;
      displayName: string;
      lastAt: string;
      lastPreview: string;
      lastDirection: "in" | "out";
      quoteUnreadCount: number;
      textUnreadCount: number;
      /** quote + text; kept for bell badge */
      unreadCount: number;
    }
  | {
      kind: "group";
      groupId: string;
      name: string;
      memberCount: number;
      lastAt: string;
      lastPreview: string;
      quoteUnreadCount: number;
      textUnreadCount: number;
      unreadCount: number;
    };

export type ChatTextMessage = {
  kind: "text";
  id: string;
  body: string;
  from: { userId: string; displayName: string };
  createdAt: string;
  youSent: boolean;
  reactions: ChatReaction[];
};

export type DmQuoteMessage = {
  kind: "quote";
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
  reactions: ChatReaction[];
};

export type GroupQuoteMessage = {
  kind: "quote";
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
  reactions: ChatReaction[];
};

export type DmThreadMessage = DmQuoteMessage | ChatTextMessage;
export type GroupThreadMessage = GroupQuoteMessage | ChatTextMessage;

/** @deprecated use DmQuoteMessage — kept name alias for gradual client migrate */
export type DmMessage = DmQuoteMessage;
/** @deprecated use GroupQuoteMessage */
export type GroupMessage = GroupQuoteMessage;

export async function listChatThreads(
  db: D1Database,
  userId: string,
): Promise<ChatThreadSummary[]> {
  const threads: ChatThreadSummary[] = [];
  const friends = await listFriends(db, userId);
  const friendIds = new Set(friends.map((f) => f.userId));

  const dmPeers = new Set<string>();

  const inboxPeers = await db
    .prepare(
      `SELECT
         CASE WHEN sender_user_id = ? THEN recipient_user_id ELSE sender_user_id END AS peer_id
       FROM line_inbox
       WHERE group_id IS NULL
         AND (sender_user_id = ? OR recipient_user_id = ?)
       GROUP BY peer_id`,
    )
    .bind(userId, userId, userId)
    .all<{ peer_id: string }>();
  for (const row of inboxPeers.results ?? []) dmPeers.add(row.peer_id);

  const textPeers = await db
    .prepare(
      `SELECT CASE WHEN dm_user_a = ? THEN dm_user_b ELSE dm_user_a END AS peer_id
       FROM chat_messages
       WHERE group_id IS NULL AND (dm_user_a = ? OR dm_user_b = ?)
       GROUP BY peer_id`,
    )
    .bind(userId, userId, userId)
    .all<{ peer_id: string }>();
  for (const row of textPeers.results ?? []) dmPeers.add(row.peer_id);

  for (const peerId of dmPeers) {
    if (!friendIds.has(peerId)) continue;
    if (await isBlocked(db, userId, peerId)) continue;

    const pair = canonicalPair(userId, peerId);
    const lastQuote = await db
      .prepare(
        `SELECT title_id, prompt_line_index, created_at, sender_user_id
         FROM line_inbox
         WHERE group_id IS NULL
           AND ((sender_user_id = ? AND recipient_user_id = ?)
             OR (sender_user_id = ? AND recipient_user_id = ?))
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(userId, peerId, peerId, userId)
      .first<{
        title_id: string;
        prompt_line_index: number;
        created_at: string;
        sender_user_id: string;
      }>();

    const lastText = await db
      .prepare(
        `SELECT body, created_at, sender_user_id
         FROM chat_messages
         WHERE dm_user_a = ? AND dm_user_b = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(pair.userA, pair.userB)
      .first<{ body: string; created_at: string; sender_user_id: string }>();

    if (!lastQuote && !lastText) continue;

    const quoteNewer =
      lastQuote && (!lastText || lastQuote.created_at >= lastText.created_at);
    const lastAt = quoteNewer
      ? (lastQuote?.created_at ?? lastText!.created_at)
      : lastText!.created_at;
    const lastPreview = quoteNewer
      ? `Line ${Number(lastQuote!.prompt_line_index) + 1} · ${lastQuote!.title_id}`
      : truncatePreview(lastText!.body);
    const lastSender = quoteNewer ? lastQuote!.sender_user_id : lastText!.sender_user_id;

    const quoteUnreadRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM line_inbox
         WHERE recipient_user_id = ? AND sender_user_id = ?
           AND group_id IS NULL AND read_at IS NULL`,
      )
      .bind(userId, peerId)
      .first<{ n: number }>();
    const quoteUnreadCount = Number(quoteUnreadRow?.n ?? 0);
    const textCount = await textUnreadCount(
      db,
      userId,
      dmThreadKey(userId, peerId),
      pair,
      null,
    );

    const peer = friends.find((f) => f.userId === peerId);
    threads.push({
      kind: "dm",
      peerUserId: peerId,
      displayName: peer?.displayName ?? "A player",
      lastAt,
      lastPreview,
      lastDirection: lastSender === userId ? "out" : "in",
      quoteUnreadCount,
      textUnreadCount: textCount,
      unreadCount: quoteUnreadCount + textCount,
    });
  }

  const groups = await listGroups(db, userId);
  for (const group of groups) {
    const lastQuote = await db
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

    const lastText = await db
      .prepare(
        `SELECT body, created_at, sender_user_id
         FROM chat_messages
         WHERE group_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .bind(group.id)
      .first<{ body: string; created_at: string; sender_user_id: string }>();

    const quoteUnreadRow = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM line_inbox
         WHERE recipient_user_id = ? AND group_id = ? AND read_at IS NULL`,
      )
      .bind(userId, group.id)
      .first<{ n: number }>();
    const quoteUnreadCount = Number(quoteUnreadRow?.n ?? 0);
    const textCount = await textUnreadCount(
      db,
      userId,
      groupThreadKey(group.id),
      null,
      group.id,
    );

    const memberCount = group.members.length + 1;
    let lastAt = group.createdAt;
    let lastPreview = "No messages yet";
    if (lastQuote || lastText) {
      const quoteNewer =
        lastQuote && (!lastText || lastQuote.created_at >= lastText.created_at);
      lastAt = quoteNewer ? lastQuote!.created_at : lastText!.created_at;
      lastPreview = quoteNewer
        ? `Line ${Number(lastQuote!.prompt_line_index) + 1} · ${lastQuote!.title_id}`
        : truncatePreview(lastText!.body);
    }

    threads.push({
      kind: "group",
      groupId: group.id,
      name: group.name,
      memberCount,
      lastAt,
      lastPreview,
      quoteUnreadCount,
      textUnreadCount: textCount,
      unreadCount: quoteUnreadCount + textCount,
    });
  }

  threads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
  return threads.slice(0, THREAD_CAP);
}

async function listDmTextMessages(
  db: D1Database,
  userId: string,
  peerUserId: string,
): Promise<ChatTextMessage[]> {
  const pair = canonicalPair(userId, peerUserId);
  const result = await db
    .prepare(
      `SELECT m.id, m.body, m.created_at, m.sender_user_id, u.display_name AS sender_name
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.dm_user_a = ? AND m.dm_user_b = ?
       ORDER BY m.created_at ASC
       LIMIT ?`,
    )
    .bind(pair.userA, pair.userB, MESSAGE_CAP)
    .all<{
      id: string;
      body: string;
      created_at: string;
      sender_user_id: string;
      sender_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    kind: "text" as const,
    id: row.id,
    body: row.body,
    from: {
      userId: row.sender_user_id,
      displayName: publicName(row.sender_name),
    },
    createdAt: row.created_at,
    youSent: row.sender_user_id === userId,
    reactions: [] as ChatReaction[],
  }));
}

async function listGroupTextMessages(
  db: D1Database,
  userId: string,
  groupId: string,
): Promise<ChatTextMessage[]> {
  const result = await db
    .prepare(
      `SELECT m.id, m.body, m.created_at, m.sender_user_id, u.display_name AS sender_name
       FROM chat_messages m
       JOIN users u ON u.id = m.sender_user_id
       WHERE m.group_id = ?
       ORDER BY m.created_at ASC
       LIMIT ?`,
    )
    .bind(groupId, MESSAGE_CAP)
    .all<{
      id: string;
      body: string;
      created_at: string;
      sender_user_id: string;
      sender_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    kind: "text" as const,
    id: row.id,
    body: row.body,
    from: {
      userId: row.sender_user_id,
      displayName: publicName(row.sender_name),
    },
    createdAt: row.created_at,
    youSent: row.sender_user_id === userId,
    reactions: [] as ChatReaction[],
  }));
}

function mergeByCreatedAt<T extends { createdAt: string }>(a: T[], b: T[], cap: number): T[] {
  return [...a, ...b]
    .sort((x, y) => (x.createdAt < y.createdAt ? -1 : x.createdAt > y.createdAt ? 1 : 0))
    .slice(-cap);
}

export async function listDmMessages(
  db: D1Database,
  user: User,
  peerUserIdRaw: string,
): Promise<{ peer: { userId: string; displayName: string }; messages: DmThreadMessage[] } | ActionError> {
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

  const quotes: DmQuoteMessage[] = (result.results ?? []).map((row) => {
    const direction: "in" | "out" = row.sender_user_id === user.id ? "out" : "in";
    return {
      kind: "quote" as const,
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
      receipt: direction === "out" ? (row.read_at ? ("read" as const) : ("sent" as const)) : null,
      reactions: [],
    };
  });

  const texts = await listDmTextMessages(db, user.id, peerUserId);
  const merged = mergeByCreatedAt(quotes, texts, MESSAGE_CAP);
  const reactionMap = await loadReactionsMap(
    db,
    user.id,
    merged.map((message) =>
      message.kind === "text"
        ? { kind: "text" as const, id: message.id }
        : { kind: "quote" as const, id: message.shareId },
    ),
  );
  const messages = attachReactions(merged, reactionMap, (message) =>
    message.kind === "text" ? message.id : message.shareId,
  );

  return {
    peer: { userId: peer.id, displayName: publicName(peer.display_name) },
    messages,
  };
}

export async function listGroupMessages(
  db: D1Database,
  user: User,
  groupIdRaw: string,
): Promise<{ name: string; messages: GroupThreadMessage[] } | ActionError> {
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

  const quotes: GroupQuoteMessage[] = [...byShare.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .slice(-MESSAGE_CAP)
    .map((acc) => ({
      kind: "quote" as const,
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
      reactions: [],
    }));

  const texts = await listGroupTextMessages(db, user.id, groupId);
  const merged = mergeByCreatedAt(quotes, texts, MESSAGE_CAP);
  const reactionMap = await loadReactionsMap(
    db,
    user.id,
    merged.map((message) =>
      message.kind === "text"
        ? { kind: "text" as const, id: message.id }
        : { kind: "quote" as const, id: message.shareId },
    ),
  );
  const messages = attachReactions(merged, reactionMap, (message) =>
    message.kind === "text" ? message.id : message.shareId,
  );

  return { name: group.name, messages };
}

export async function postDmMessage(
  db: D1Database,
  user: User,
  peerUserIdRaw: string,
  bodyRaw: unknown,
): Promise<{ message: ChatTextMessage } | ActionError> {
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
  const body = normalizeBody(bodyRaw);
  if (!body) return { error: "Message must be 1–1000 characters", status: 400 };

  const pair = canonicalPair(user.id, peerUserId);
  const id = createId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO chat_messages (id, sender_user_id, body, created_at, dm_user_a, dm_user_b, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, body, createdAt, pair.userA, pair.userB, null)
    .run();
  await upsertThreadRead(db, user.id, dmThreadKey(user.id, peerUserId), createdAt);

  return {
    message: {
      kind: "text",
      id,
      body,
      from: { userId: user.id, displayName: publicName(user.displayName) },
      createdAt,
      youSent: true,
      reactions: [],
    },
  };
}

export async function postGroupMessage(
  db: D1Database,
  user: User,
  groupIdRaw: string,
  bodyRaw: unknown,
): Promise<{ message: ChatTextMessage } | ActionError> {
  const groupId = groupIdRaw.trim();
  if (!isValidFriendUserId(groupId)) return { error: "Invalid group", status: 400 };
  const group = await userCanAccessGroup(db, groupId, user.id);
  if (!group) return { error: "Not found", status: 404 };
  const body = normalizeBody(bodyRaw);
  if (!body) return { error: "Message must be 1–1000 characters", status: 400 };

  const id = createId();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO chat_messages (id, sender_user_id, body, created_at, dm_user_a, dm_user_b, group_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, user.id, body, createdAt, null, null, groupId)
    .run();
  await upsertThreadRead(db, user.id, groupThreadKey(groupId), createdAt);

  return {
    message: {
      kind: "text",
      id,
      body,
      from: { userId: user.id, displayName: publicName(user.displayName) },
      createdAt,
      youSent: true,
      reactions: [],
    },
  };
}

export async function toggleChatReaction(
  db: D1Database,
  user: User,
  input: {
    targetKind: unknown;
    targetId: unknown;
    emoji: unknown;
    peerUserId?: unknown;
    groupId?: unknown;
  },
): Promise<{ reactions: ChatReaction[] } | ActionError> {
  const targetKind = input.targetKind === "text" || input.targetKind === "quote" ? input.targetKind : null;
  const targetId = typeof input.targetId === "string" ? input.targetId.trim() : "";
  if (!targetKind || !targetId) return { error: "Invalid target", status: 400 };
  if (!isAllowedEmoji(input.emoji)) return { error: "Invalid emoji", status: 400 };
  const emoji = input.emoji;

  const peerRaw = typeof input.peerUserId === "string" ? input.peerUserId.trim() : "";
  const groupRaw = typeof input.groupId === "string" ? input.groupId.trim() : "";
  if (peerRaw && groupRaw) return { error: "Pick DM or group", status: 400 };
  if (!peerRaw && !groupRaw) return { error: "Missing thread", status: 400 };

  if (peerRaw) {
    if (!isValidFriendUserId(peerRaw) || peerRaw === user.id) {
      return { error: "Invalid user", status: 400 };
    }
    if (!(await areFriends(db, user.id, peerRaw))) return { error: "Not found", status: 404 };
    if (await isBlocked(db, user.id, peerRaw)) return { error: "Not found", status: 404 };

    if (targetKind === "text") {
      const pair = canonicalPair(user.id, peerRaw);
      const row = await db
        .prepare(
          `SELECT id FROM chat_messages
           WHERE id = ? AND dm_user_a = ? AND dm_user_b = ?`,
        )
        .bind(targetId, pair.userA, pair.userB)
        .first<{ id: string }>();
      if (!row) return { error: "Not found", status: 404 };
    } else {
      const row = await db
        .prepare(
          `SELECT share_id FROM line_inbox
           WHERE share_id = ? AND group_id IS NULL
             AND ((sender_user_id = ? AND recipient_user_id = ?)
               OR (sender_user_id = ? AND recipient_user_id = ?))
           LIMIT 1`,
        )
        .bind(targetId, user.id, peerRaw, peerRaw, user.id)
        .first<{ share_id: string }>();
      if (!row) return { error: "Not found", status: 404 };
    }
  } else {
    if (!isValidFriendUserId(groupRaw)) return { error: "Invalid group", status: 400 };
    const group = await userCanAccessGroup(db, groupRaw, user.id);
    if (!group) return { error: "Not found", status: 404 };

    if (targetKind === "text") {
      const row = await db
        .prepare(`SELECT id FROM chat_messages WHERE id = ? AND group_id = ?`)
        .bind(targetId, groupRaw)
        .first<{ id: string }>();
      if (!row) return { error: "Not found", status: 404 };
    } else {
      const row = await db
        .prepare(
          `SELECT share_id FROM line_inbox WHERE share_id = ? AND group_id = ? LIMIT 1`,
        )
        .bind(targetId, groupRaw)
        .first<{ share_id: string }>();
      if (!row) return { error: "Not found", status: 404 };
    }
  }

  const existing = await db
    .prepare(
      `SELECT id FROM chat_reactions
       WHERE target_kind = ? AND target_id = ? AND emoji = ? AND user_id = ?`,
    )
    .bind(targetKind, targetId, emoji, user.id)
    .first<{ id: string }>();

  if (existing) {
    await db.prepare(`DELETE FROM chat_reactions WHERE id = ?`).bind(existing.id).run();
  } else {
    await db
      .prepare(
        `INSERT INTO chat_reactions (id, target_kind, target_id, emoji, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(createId(), targetKind, targetId, emoji, user.id, new Date().toISOString())
      .run();
  }

  const map = await loadReactionsMap(db, user.id, [{ kind: targetKind, id: targetId }]);
  return { reactions: map.get(reactionKey(targetKind, targetId)) ?? [] };
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
  await upsertThreadRead(db, user.id, dmThreadKey(user.id, peerUserId), now);
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
  await upsertThreadRead(db, user.id, groupThreadKey(groupId), now);
  return { ok: true };
}
