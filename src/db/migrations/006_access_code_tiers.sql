-- 게스트 접속 코드를 2단계로 확장한다.
-- tier=1: 마스터가 게스트에게 건네는 "초대 코드"(기존 10개). 등록하면
--         곧바로 대시보드에 들어가는 게 아니라, tier=2 기기별 코드 3개를
--         발급받는다.
-- tier=2: PC/노트북/휴대폰 등 기기 1대당 1개씩, 실제로 이 코드를 입력해야
--         비로소 그 기기에서 대시보드 세션이 열린다(기존 게스트 코드와
--         동일한 1회성 session_token 발급 방식).
ALTER TABLE access_codes ADD COLUMN tier INTEGER NOT NULL DEFAULT 1;
ALTER TABLE access_codes ADD COLUMN parent_id INTEGER REFERENCES access_codes(id);
ALTER TABLE access_codes ADD COLUMN device_label TEXT;
