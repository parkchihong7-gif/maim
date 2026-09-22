-- 통합 관리자 대시보드 접속키로 들어온 사람의 **세션**을 적어 두는 곳.
--
-- 왜 따로 두나
--   키 자체는 여기에 없다. 키 장부는 앱스 스크립트(구글 시트)가 들고 있고,
--   여기는 "이 브라우저는 아까 통과했다" 만 기억한다.
--
-- 왜 요청마다 키 서버에 안 묻나
--   앱스 스크립트는 한 번 부르는 데 1~2초가 걸린다. 화면이 API 를 여러 번
--   부르는데 그때마다 물으면 못 쓴다. 그래서 들어올 때 한 번 묻고, 그 뒤엔
--   여기 적힌 것으로 본다. 대신 화면이 1분마다 checkSession 으로 다시
--   물어서, 키가 정지되거나 다른 기기가 같은 2차키로 들어오면 끊는다.
CREATE TABLE IF NOT EXISTS keyserver_sessions (
  token         TEXT PRIMARY KEY,   -- 이 서버가 만든 것. 브라우저가 들고 다닌다
  key2          TEXT NOT NULL,      -- 2차 인증키. checkSession 에 필요하다
  remote_token  TEXT NOT NULL,      -- 키 서버가 준 세션값
  holder_name   TEXT NOT NULL DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'client',
  device_label  TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  checked_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_keyserver_sessions_key2
  ON keyserver_sessions (key2);
