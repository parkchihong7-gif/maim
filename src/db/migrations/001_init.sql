CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  requires_search INTEGER NOT NULL DEFAULT 0,
  prompt_hint TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  status TEXT NOT NULL DEFAULT 'draft',
  title TEXT,
  content TEXT,
  image_path TEXT,
  image_query TEXT,
  tags_json TEXT,
  scheduled_at TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO categories (name, requires_search, prompt_hint, active) VALUES
  ('종합 뉴스', 1, '오늘 대한민국의 주요 종합 뉴스 이슈를 다룬다.', 1),
  ('정책자금 뉴스', 1, '최신 정부/지자체 정책자금·지원금 소식을 다룬다.', 1),
  ('부동산 뉴스', 1, '최신 부동산 시장 동향과 정책을 다룬다.', 1),
  ('게임 웹진', 1, '최신 게임 업계 소식과 신작 정보를 다룬다.', 1),
  ('리그오브레전드', 1, '최신 LoL 패치, 프로씬, 메타 정보를 다룬다.', 1),
  ('스마트폰', 1, '최신 스마트폰 신제품/업계 소식을 다룬다.', 1),
  ('AI 생각', 1, '최신 AI 산업 동향에 대한 개인적 의견을 다룬다.', 1),
  ('일상 에세이', 0, '자유로운 일상 소재의 에세이. 검색 없이 창작.', 1),
  ('생활 꿀팁', 0, '생활 속 실용적인 팁을 다룬다. 검색 없이 창작.', 1);
