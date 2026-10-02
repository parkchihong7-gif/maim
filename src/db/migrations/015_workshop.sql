-- ✍️ 글 작업실 — 사람이 단계마다 승인하며 한 편을 쓰는 작업. 상위 글 원문은 저장하지 않는다(숫자·제목·요약만).
CREATE TABLE IF NOT EXISTS workshops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  post_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workshops_owner ON workshops (owner_key, updated_at);
