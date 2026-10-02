-- 🎨 내 블로그 분석 — 분석 결과(초안)와 사람이 승인한 버전. 원문 글은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS style_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL DEFAULT '',
  ver INTEGER NOT NULL,
  blog_id TEXT NOT NULL DEFAULT '',
  post_count INTEGER NOT NULL DEFAULT 0,
  stats_json TEXT,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_style_versions_owner ON style_versions (owner_key, ver);
