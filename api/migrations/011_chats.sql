-- Chats: unread + group thread pointer on line_inbox
ALTER TABLE line_inbox ADD COLUMN read_at TEXT;
ALTER TABLE line_inbox ADD COLUMN group_id TEXT;

CREATE INDEX IF NOT EXISTS idx_line_inbox_sender
  ON line_inbox (sender_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_inbox_group
  ON line_inbox (group_id, created_at DESC);
