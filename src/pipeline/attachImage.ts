import path from "node:path";
import fs from "node:fs";
import type { Post } from "../db/repositories/posts.js";
import { setPostImage } from "../db/repositories/posts.js";
import { searchAndDownloadCandidates } from "../images/searchImages.js";
import { selectBestImage } from "../images/selectImage.js";
import { processImage } from "../images/processImage.js";
import { config } from "../config.js";

/**
 * 포스팅 1건에 대해 이미지 검색 -> 비전 선택 -> 가공 -> DB 반영까지 수행한다.
 * page를 다르게 주면(재생성 시) 검색 결과의 다른 페이지에서 후보를 가져와
 * 매번 같은 이미지가 나오지 않도록 한다.
 */
export async function attachImage(post: Post, options: { page?: number } = {}): Promise<string> {
  if (!post.image_query) {
    throw new Error(`포스팅 ${post.id}에 image_query가 없습니다.`);
  }

  const postDir = path.join(config.paths.generatedDir, String(post.id));
  const candidatesDir = path.join(postDir, "candidates");

  const candidates = await searchAndDownloadCandidates(
    post.image_query,
    candidatesDir,
    6,
    options.page ?? 1,
  );
  const summary = (post.content ?? "").slice(0, 500);
  const selected = await selectBestImage(candidates, summary);

  const finalPath = path.join(postDir, "final.jpg");
  fs.mkdirSync(postDir, { recursive: true });
  await processImage(selected, finalPath);

  setPostImage(post.id, finalPath);
  return finalPath;
}
