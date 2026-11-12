import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";

export interface ImageDownloadInput {
  postId: number;
  imageIndex: number;
  sourceSite: string;
  sourceId: string | null;
  sourceUrl: string | null;
  license: string | null;
}

export function recordImageDownload(input: ImageDownloadInput): void {
  getDb()
    .prepare(
      `INSERT INTO image_downloads (post_id, image_index, source_site, source_id, source_url, license)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(input.postId, input.imageIndex, input.sourceSite, input.sourceId, input.sourceUrl, input.license);
}

export interface ImageDownloadRow {
  id: number;
  post_id: number;
  post_title: string | null;
  image_index: number;
  source_site: string;
  source_id: string | null;
  source_url: string | null;
  license: string | null;
  downloaded_at: string;
}

/**
 * 이 자리(owner_key)가 **이미 글에 쓴 사진들** — `"site:sourceId"` 꼴 집합.
 * 새 글의 사진을 찾을 때 이 집합에 있는 건 걸러서, 200편 넘게 쌓이며 같은
 * 무료 스톡 사진이 여러 글에 반복해서 쓰이는 걸 막는다(`images/searchImages.ts`
 * `searchWithFallback()` 의 `exclude` 로 넘겨준다).
 */
export function 이미쓴소스들(): Set<string> {
  const rows = getDb()
    .prepare(
      `SELECT d.source_site, d.source_id FROM image_downloads d
       JOIN posts p ON p.id = d.post_id
       WHERE p.owner_key = ? AND d.source_id IS NOT NULL`,
    )
    .all(지금주인()) as { source_site: string; source_id: string }[];
  return new Set(rows.map((r) => `${r.source_site}:${r.source_id}`));
}

/** CSV 내보내기용 — 포스팅 제목까지 함께 내려받은 시각 순으로 반환한다. */
export function listImageDownloads(): ImageDownloadRow[] {
  return getDb()
    .prepare(
      `SELECT d.id, d.post_id, p.title AS post_title, d.image_index, d.source_site,
              d.source_id, d.source_url, d.license, d.downloaded_at
       FROM image_downloads d
       JOIN posts p ON p.id = d.post_id
       WHERE p.owner_key = ?
       ORDER BY d.downloaded_at DESC, d.id DESC`,
    )
    .all(지금주인()) as ImageDownloadRow[];
}
