-- 📣 X(트위터) 등록 리스트 — 발행은 사람이 하므로 실제 글 주소는 나중에
-- 사람이 직접 넣는다. AI 요약은 그 주소 없이도(제목·본문만으로) 먼저 만들 수 있다.
ALTER TABLE posts ADD COLUMN x_url TEXT;
ALTER TABLE posts ADD COLUMN x_platform TEXT;
ALTER TABLE posts ADD COLUMN x_summary TEXT;
ALTER TABLE posts ADD COLUMN x_summary_at TEXT;
ALTER TABLE posts ADD COLUMN x_registered_at TEXT;
