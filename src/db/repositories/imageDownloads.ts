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
