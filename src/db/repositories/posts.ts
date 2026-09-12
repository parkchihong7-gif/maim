import { getDb } from "../index.js";
import { DateTime } from "luxon";
import { config } from "../../config.js";

export type PostStatus = "draft" | "queued" | "published" | "failed";

export interface Post {
  id: number;
  category_id: number;
  status: PostStatus;
  title: string | null;
  content: string | null;
  image_path: string | null;
  image_query: string | null;
  tags_json: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
  error_message: string | null;
}

export function insertDraftPost(input: {
  categoryId: number;
  title: string;
  content: string;
  imageQuery: string;
  tags: string[];
}): Post {
  const result = getDb()
    .prepare(
      `INSERT INTO posts (category_id, status, title, content, image_query, tags_json)
       VALUES (?, 'draft', ?, ?, ?, ?)`,
    )
    .run(input.categoryId, input.title, input.content, input.imageQuery, JSON.stringify(input.tags));
  return getPost(Number(result.lastInsertRowid))!;
}

export function getPost(id: number): Post | undefined {
  return getDb().prepare("SELECT * FROM posts WHERE id = ?").get(id) as Post | undefined;
}

export function setPostImage(id: number, imagePath: string): void {
  getDb().prepare("UPDATE posts SET image_path = ? WHERE id = ?").run(imagePath, id);
}

export function queuePost(id: number, scheduledAtIso: string): void {
  getDb()
    .prepare("UPDATE posts SET status = 'queued', scheduled_at = ? WHERE id = ?")
    .run(scheduledAtIso, id);
}

export function markPublished(id: number): void {
  getDb()
    .prepare("UPDATE posts SET status = 'published', published_at = datetime('now') WHERE id = ?")
    .run(id);
}

export function markFailed(id: number, errorMessage: string): void {
  getDb()
    .prepare("UPDATE posts SET status = 'failed', error_message = ? WHERE id = ?")
    .run(errorMessage, id);
}

export function listDuePosts(nowIso: string): Post[] {
  return getDb()
    .prepare("SELECT * FROM posts WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at ASC")
    .all(nowIso) as Post[];
}

export function listHistory(limit = 50): Post[] {
  return getDb()
    .prepare("SELECT * FROM posts ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Post[];
}

/**
 * 오늘(설정 타임존 기준) queued+published 상태인 포스팅 수 — 5개/일 캡 강제에 사용.
 *
 * 주의: sqlite의 `created_at` 컬럼은 `datetime('now')` 기본값이라
 * "YYYY-MM-DD HH:MM:SS"(공백 구분, UTC, 밀리초 없음) 형식으로 저장된다.
 * Luxon의 `.toISO()`(예: "2026-09-12T15:00:00.000Z")와 형식이 달라
 * SQL의 문자열 BETWEEN 비교로는 항상 매치에 실패한다 — 반드시 JS 쪽에서
 * DateTime.fromSQL로 파싱해 비교해야 한다.
 */
export function countTodayCommitted(): number {
  const startOfDayUtc = DateTime.now().setZone(config.timezone).startOf("day").toUTC();
  const endOfDayUtc = DateTime.now().setZone(config.timezone).endOf("day").toUTC();

  const rows = getDb()
    .prepare(`SELECT created_at FROM posts WHERE status IN ('queued', 'published')`)
    .all() as { created_at: string }[];

  return rows.filter((row) => {
    const createdUtc = DateTime.fromSQL(row.created_at, { zone: "utc" });
    return createdUtc >= startOfDayUtc && createdUtc <= endOfDayUtc;
  }).length;
}
