CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  creator TEXT NOT NULL,
  cover TEXT,
  like_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  dislike_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  person_id TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  vote_type TEXT NOT NULL,
  voted_at TEXT NOT NULL,
  PRIMARY KEY (person_id, item_id)
);

CREATE TABLE IF NOT EXISTS archives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_votes_item ON votes(item_id);
CREATE INDEX IF NOT EXISTS idx_archives_category ON archives(category);
