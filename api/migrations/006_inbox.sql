-- Directed one-line inbox (frozen mini_share of length 1)
CREATE TABLE IF NOT EXISTS line_inbox (
  id TEXT PRIMARY KEY,
  share_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  prompt_line_index INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (recipient_user_id, share_id)
);

CREATE INDEX IF NOT EXISTS idx_line_inbox_recipient ON line_inbox (recipient_user_id, created_at DESC);
