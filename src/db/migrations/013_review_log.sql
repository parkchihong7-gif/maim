-- AI 최종 검수 기록. 체험 자리는 하루 5회까지(사장님 AI 한도를 쓰므로).
CREATE TABLE IF NOT EXISTS review_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL DEFAULT '',
  post_id INTEGER,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_review_log_owner ON review_log (owner_key, at);
