-- 네이버 키워드 보관함. 🔎 네이버 키워드 탭에서 [지금 모으기] 로 채운다.
-- 글쓰기는 이 표를 **읽기만** 한다 (체크한 카테고리만, src/naver/보관함사용.ts).
CREATE TABLE IF NOT EXISTS keyword_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key TEXT NOT NULL DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  pc INTEGER,
  mobile INTEGER,
  comp TEXT,
  doc_total INTEGER,
  ratio REAL,
  grade TEXT NOT NULL DEFAULT 'unknown',
  seed TEXT,
  top_json TEXT,
  status TEXT NOT NULL DEFAULT 'candidate',
  fetched_at TEXT,
  used_at TEXT,
  UNIQUE(owner_key, category_id, keyword)
);
CREATE INDEX IF NOT EXISTS idx_kp_cat ON keyword_pool (owner_key, category_id, status);
