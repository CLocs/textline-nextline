-- Chats indexes (columns added idempotently by scripts/ensure-share-columns.mjs)
CREATE INDEX IF NOT EXISTS idx_line_inbox_sender
  ON line_inbox (sender_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_inbox_group
  ON line_inbox (group_id, created_at DESC);
