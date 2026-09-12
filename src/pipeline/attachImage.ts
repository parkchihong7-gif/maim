import path from "node:path";
import fs from "node:fs";
import type { Post } from "../db/repositories/posts.js";
import { setPostImage } from "../db/repositories/posts.js";
import { searchAndDownloadCandidates } from "../images/searchImages.js";
import { selectBestImage } from "../images/selectImage.js";
import { processImage } from "../images/processImage.js";
import { config } from "../config.js";

/** 포스팅 1건에 대해 이미지 검색 -> 비전 선택 -> 가공 -> DB 반영까지 수행한다. */
export async function attachImage(post: Post): Promise<string> {
  if (!post.image_query) {
    throw new Error(`포스팅 ${post.id}에 image_query가 없습니다.`);
  }

  const postDir = path.join(config.paths.generatedDir, String(post.id));
  const candidatesDir = path.join(postDir, "candidates");

  const candidates = await searchAndDownloadCandidates(post.image_query, candidatesDir);
  const summary = (post.content ?? "").slice(0, 500);
  const selected = await selectBestImage(candidates, summary);

  const finalPath = path.join(postDir, "final.jpg");
  fs.mkdirSync(postDir, { recursive: true });
  await processImage(selected, finalPath);

  setPostImage(post.id, finalPath);
  return finalPath;
}
