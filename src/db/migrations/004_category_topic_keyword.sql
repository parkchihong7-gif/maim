-- 카테고리별 "우선 검색 키워드". 값이 있으면 포스팅 생성 시 이 키워드 관련
-- 최신 뉴스/정보를 최우선으로 검색·반영하도록 프롬프트에 반영한다.
ALTER TABLE categories ADD COLUMN topic_keyword TEXT;
