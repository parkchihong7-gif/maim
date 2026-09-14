import path from "node:path";
import fs from "node:fs";
import type { Post } from "../db/repositories/posts.js";
import { addPostImages, getImagePaths } from "../db/repositories/posts.js";
import { searchWithFallback } from "../images/searchImages.js";
import { selectBestImages } from "../images/selectImage.js";
import { processImage } from "../images/processImage.js";
import { config } from "../config.js";

export interface AttachImageOptions {
  /** 몇 장을 새로 준비할지. 최초 생성/"재생성" 클릭 모두 기본 3장. */
  count?: number;
  /** 검색 결과의 몇 번째 페이지를 볼지. 재생성 시 랜덤하게 바꿔서 매번 다른 후보가 나오게 한다. */
  page?: number;
  /** true면 기존 이미지 오른쪽에 추가, false면 전체를 새로 교체(최초 생성). */
  append?: boolean;
}

/**
 * 포스팅 1건에 이미지를 준비해 붙인다: 검색 -> 비전으로 순위 선택 -> 가공 -> DB 반영.
 * append=true(재생성)면 새 이미지를 기존 이미지 오른쪽에 추가하고, append=false(최초
 * 생성)면 요청한 개수만큼 새로 만들어 통째로 교체한다.
 */
export async function attachImage(post: Post, options: AttachImageOptions = {}): Promise<string[]> {
  if (!post.image_query) {
    throw new Error(`포스팅 ${post.id}에 image_query가 없습니다.`);
  }

  const count = options.count ?? 3;
  const append = options.append ?? false;

  const postDir = path.join(config.paths.generatedDir, String(post.id));
  const candidatesDir = path.join(postDir, "candidates");

  const candidates = await searchWithFallback(
    post.image_query,
    candidatesDir,
    Math.max(count * 2, 6),
    options.page ?? 1,
  );
  const summary = (post.content ?? "").slice(0, 500);
  const selected = await selectBestImages(candidates, summary, count);

  fs.mkdirSync(postDir, { recursive: true });
  const existingCount = append ? getImagePaths(post).length : 0;
  const newPaths: string[] = [];
  const newAlts: string[] = [];
  for (let i = 0; i < selected.length; i++) {
    const finalPath = path.join(postDir, `final-${existingCount + i + 1}.jpg`);
    await processImage(selected[i].filePath, finalPath);
    newPaths.push(finalPath);
    newAlts.push(selected[i].alt);
  }

  addPostImages(post.id, newPaths, newAlts, append);
  return newPaths;
}
