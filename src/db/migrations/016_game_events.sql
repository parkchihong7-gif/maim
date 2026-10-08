-- 🎮 출시·업데이트 달력 — 게임 하나를 넣으면 A~F 여섯 단계 글이 날짜에 맞춰 열린다(src/pipeline/출시계획.ts).
CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'release',
  date TEXT NOT NULL,
  note TEXT,
  source TEXT,
  steps_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_events_owner ON game_events (owner_key, date);
