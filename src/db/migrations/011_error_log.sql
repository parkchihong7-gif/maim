-- 글 만들기에서 난 오류를 남겨 둔다.
--
-- 체험 회원 화면에 뜬 오류는 그분만 본다. 휴대폰 알림창이면 복사도 안 된다.
-- 서버 주인이 자기 화면에서 «누가, 언제, 어느 카테고리에서, 무엇이» 를 볼 수
-- 있어야 고칠 수 있다.
CREATE TABLE IF NOT EXISTS error_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_key   TEXT NOT NULL DEFAULT '',   -- 누구의 자리에서 (빈 값 = 주인)
  role        TEXT NOT NULL DEFAULT '',
  stage       TEXT NOT NULL,              -- 글쓰기 / 이미지 / 이미지 재생성
  category    TEXT NOT NULL DEFAULT '',
  message     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_error_log_owner ON error_log (owner_key, id);
