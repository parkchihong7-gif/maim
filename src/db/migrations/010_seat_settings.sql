-- 체험 자리마다 따로 두는 «글 스타일» 설정.
--
-- 블로그 유형·주제·톤 프리셋·보강 지시·최소 글자수 다섯 가지만 여기에 둔다.
-- 주인(owner_key = '')은 계속 settings 표를 쓴다 — 이 표는 체험 자리 전용이다.
-- AI 연결·이미지 키·아침 예약은 여기에 오지 않는다. 그건 서버 주인의 것이다.
--
-- 기간이 끝난 체험 키는 죽은자리치우기 가 purgeTenant 로 이 줄도 같이 지운다.
CREATE TABLE IF NOT EXISTS seat_settings (
  owner_key  TEXT NOT NULL,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (owner_key, key)
);
