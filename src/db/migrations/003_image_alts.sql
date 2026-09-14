-- 이미지별 SEO 대체텍스트(alt) 저장용. image_paths_json과 같은 순서로 대응된다.
ALTER TABLE posts ADD COLUMN image_alts_json TEXT;
