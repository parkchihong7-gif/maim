-- 마스터 토큰과 별도로, 불특정 다수에게 딱 1회만 통하는 게스트 접속 코드용 테이블.
-- session_token은 코드가 실제로 redeem됐을 때만 발급되는 별도의 긴 난수이며,
-- 이후 인증은 이 값으로 이뤄진다(코드 자체를 다시 넣어도 재사용 불가).
CREATE TABLE IF NOT EXISTS access_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  session_token TEXT,
  redeemed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
