/**
 * 🕹️ 글에 내 게임 스샷 붙이기 (2026-10-21 게임 스샷 개편).
 *
 * 게임을 연결한 카테고리 글은 무료 이미지(Unsplash 등)를 **아예 찾지 않는다.**
 * 그 게임 스샷 중 **아직 어떤 글에도 안 쓴 최근 것부터** 붙인다(AI 로 고르지 않는다 — 빠르고 돈이 안 든다).
 * 모자라면 무료 이미지로 채우지 않고 빈 자리로 둔다.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { addPostImages, getPost, type Post } from "../db/repositories/posts.js";
import { 글사진들, 글사진적기, 안쓴최근사진들, type 사진 } from "../db/repositories/gamePlay.js";
import { 사진읽기 } from "./사진저장.js";

/** 사진 파일을 글 폴더로 옮겨 붙인다 — 기존 📝 포스팅 카드가 그대로 보여 주고 [이미지 복사] 하게 한다. */
export async function 캡처를글에(post: Post, 사진들: 사진[], 방식: "replace" | "append" = "replace"): Promise<number> {
  const 폴더 = path.join(config.paths.generatedDir, String(post.id));
  fs.mkdirSync(폴더, { recursive: true });
  const 경로들: string[] = [];
  const 대체: string[] = [];
  const 쓴것: number[] = [];
  const 앞 = 방식 === "append" ? (JSON.parse(post.image_paths_json || "[]") as string[]).length : 0;
  for (const s of 사진들) {
    const 내용 = await 사진읽기(s.gcs_path);
    if (!내용) continue;
    const 자리 = path.join(폴더, `game-${앞 + 경로들.length + 1}-${s.id}.webp`);
    fs.writeFileSync(자리, 내용);
    경로들.push(자리);
    대체.push(s.caption || "게임 화면");
    쓴것.push(s.id);
  }
  addPostImages(post.id, 경로들, 대체, 방식 === "append");
  글사진적기(post.id, 쓴것, 방식);
  return 경로들.length;
}

/**
 * 글에 스샷을 붙인다. 돌려주는 것: 붙인 장수(0~몇). 모자라면 빈 자리 — 무료 이미지는 부르지 않는다.
 * append 면 이 글에 이미 붙인 스샷은 빼고 다음 것을 붙인다([+ 스샷 더 넣기]).
 */
export async function pickGameShots(post: Post, gameId: string, 옵션: { count?: number; append?: boolean } = {}): Promise<number> {
  const 몇 = 옵션.count ?? 3;
  const 쓴것 = 옵션.append ? 글사진들(post.id).map((s) => s.id) : [];
  const 고른 = 안쓴최근사진들(gameId, 몇, 쓴것);
  if (!고른.length) return 0;
  return 캡처를글에(getPost(post.id)!, 고른, 옵션.append ? "append" : "replace");
}
