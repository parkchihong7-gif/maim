-- 후킹 패턴이 다른 제목 후보 3개(질문형/숫자·사실 강조형/공감형)를 저장한다.
-- title 컬럼(대표 제목)과 별개로, 사용자가 마음에 드는 걸 직접 골라 복사할 수 있게 한다.
ALTER TABLE posts ADD COLUMN title_variants_json TEXT;
