-- 켜져 있으면 하루 건수(상한) 안에서 이 카테고리가 항상 먼저 들어간다 — 순차/랜덤/덜 쓴 것
-- 먼저 같은 차례와 상관없이, 매일 빠짐없이 포스팅하고 싶은 카테고리(예: 테슬라 소식)를 위한 것.
ALTER TABLE categories ADD COLUMN daily_pinned INTEGER NOT NULL DEFAULT 0;
