-- 포스팅 하나에 이미지를 여러 장(기본 3장) 담을 수 있도록 배열 컬럼 추가.
-- 기존 image_path 단일 컬럼은 남겨두되(과거 데이터 호환) 새 코드는 image_paths_json만 사용한다.
ALTER TABLE posts ADD COLUMN image_paths_json TEXT;

-- 모든 카테고리는 실시간 검색을 사용하도록 통일한다(사용자 요청).
UPDATE categories SET requires_search = 1;
