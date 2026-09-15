-- 무료 스톡 이미지(Unsplash/Pexels/Pixabay) 사용 기록. 나중에 "이 이미지를
-- 언제, 어디서, 어떤 라이선스로 받았는지" 증빙이 필요할 때를 대비해 다운로드
-- 시점의 출처 정보를 남겨둔다.
CREATE TABLE IF NOT EXISTS image_downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  image_index INTEGER NOT NULL,
  source_site TEXT NOT NULL,
  source_id TEXT,
  source_url TEXT,
  license TEXT,
  downloaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
