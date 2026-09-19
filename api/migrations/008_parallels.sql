-- Quote parallels (Light): named packs + catalog connections + upvotes
CREATE TABLE IF NOT EXISTS analogy_packs (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title_id TEXT NOT NULL,
  line_indices TEXT NOT NULL,
  share_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analogy_packs_owner
  ON analogy_packs (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analogy_connections (
  id TEXT PRIMARY KEY,
  pack_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  note TEXT,
  proposer_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_analogy_connections_pack
  ON analogy_connections (pack_id, score DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS analogy_votes (
  connection_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (connection_id, user_id)
);
