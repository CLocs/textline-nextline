-- Freeform chat text (one row per message; not fan-out like line_inbox)
CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  sender_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  dm_user_a TEXT,
  dm_user_b TEXT,
  group_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_dm
  ON chat_messages (dm_user_a, dm_user_b, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_group
  ON chat_messages (group_id, created_at);

CREATE TABLE IF NOT EXISTS chat_thread_reads (
  user_id TEXT NOT NULL,
  thread_key TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (user_id, thread_key)
);
