-- Standalone quote marks. A quote-only line is not a star.
CREATE TABLE IF NOT EXISTS quotes (
  title_id TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  quoted_at TEXT NOT NULL,
  PRIMARY KEY (title_id, line_index, player_id)
);

CREATE INDEX IF NOT EXISTS idx_quotes_player ON quotes (player_id);
