-- Directed parallel-rewrite sends (friend/group). Full chats still later.
CREATE TABLE IF NOT EXISTS parallel_inbox (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  group_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (recipient_user_id, connection_id)
);

CREATE INDEX IF NOT EXISTS idx_parallel_inbox_recipient
  ON parallel_inbox (recipient_user_id, created_at DESC);
