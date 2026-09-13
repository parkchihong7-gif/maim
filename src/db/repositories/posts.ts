import { getDb } from "../index.js";

export type PostStatus = "draft" | "ready" | "published" | "failed";

export interface Post {
  id: number;
  category_id: number;
  status: PostStatus;
  title: string | null;
  content: string | null;
  image_path: string | null;
  image_paths_json: string | null;
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

export function getImagePaths(post: Post): string[] {
  if (!post.image_paths_json) return [];
  try {
    const parsed = JSON.parse(post.image_paths_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 이미지 목록을 갱신한다. append=true면 기존 이미지 오른쪽에 새 이미지를 덧붙이고,
 * append=false면 전체를 새 목록으로 교체한다(최초 생성 시). image_path 컬럼은
 * 과거 코드 호환을 위해 항상 목록의 첫 번째 이미지로 맞춰둔다.
 */
export function addPostImages(id: number, newPaths: string[], append: boolean): void {
  const current = append ? getImagePaths(getPost(id)!) : [];
  const merged = [...current, ...newPaths];
  getDb()
    .prepare("UPDATE posts SET image_paths_json = ?, image_path = ? WHERE id = ?")
    .run(JSON.stringify(merged), merged[0] ?? null, id);
}

/** 콘텐츠(+가능하면 이미지)가 준비되어 사용자가 대시보드에서 복사해갈 수 있는 상태. */
export function markReady(id: number): void {
  getDb().prepare("UPDATE posts SET status = 'ready' WHERE id = ?").run(id);
}

/** 실제 네이버 발행은 사람이 수동으로 하므로, 이건 사용자가 "발행 완료로 표시"를 누른 기록일 뿐이다. */
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

export function listHistory(limit = 50): Post[] {
  return getDb()
    .prepare("SELECT * FROM posts ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Post[];
}
