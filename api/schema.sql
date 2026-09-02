CREATE TABLE IF NOT EXISTS stars (
  title_id   TEXT NOT NULL,
  line_index INTEGER NOT NULL,
  player_id  TEXT NOT NULL,
  starred_at TEXT NOT NULL,
  PRIMARY KEY (title_id, line_index, player_id)
);

CREATE INDEX IF NOT EXISTS idx_stars_title ON stars (title_id);
