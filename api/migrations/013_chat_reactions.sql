-- Emoji reactions on chat text + quote shares
CREATE TABLE IF NOT EXISTS chat_reactions (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (target_kind, target_id, emoji, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_target
  ON chat_reactions (target_kind, target_id);
