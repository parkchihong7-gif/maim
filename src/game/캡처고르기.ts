/**
 * 🕹️ 일반 글(최근 소식·트렌드)에 내 게임 캡처 쓰기 (GAME_PLAN 15-8).
 *
 * 게임을 연결한 카테고리 글은 무료 이미지(Unsplash 등)를 **아예 찾지 않는다.**
 * 글 제목·태그·본문 소제목과 캡처의 설명·장면·퀘스트 이름을 견주어 후보 12장을 고르고,
 * 시간이 있으면 AI 가 그중 3장을 고른다. 3장이 안 되면 무료 이미지로 채우지 않고 빈 자리로 둔다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDb } from "../db/index.js";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "../claude/parseResponse.js";
import { getPost, type Post } from "../db/repositories/posts.js";
import { 글사진들, type 사진 } from "../db/repositories/gamePlay.js";
import { 사진읽기 } from "./사진저장.js";
import { 캡처를글에 } from "../pipeline/generateGamePost.js";

export const 후보수 = 12;

function 낱말(글: string): Set<string> {
  return new Set((글.match(/[가-힣A-Za-z0-9]{2,}/g) ?? []).map((w) => w.toLowerCase()));
}

/** 견줄 말 — 제목·태그·소제목(줄 첫머리 이모지/■ 로 시작하는 짧은 줄). */
export function 글말(post: Pick<Post, "title" | "tags_json" | "content">): Set<string> {
  const 소제목 = (post.content ?? "").split("\n").filter((l) => l.trim().length < 40 && /^[^\p{L}\p{N}\s]/u.test(l.trim())).join(" ");
  let 태그 = "";
  try { 태그 = (JSON.parse(post.tags_json || "[]") as string[]).join(" "); } catch { /* 없음 */ }
  return 낱말(`${post.title ?? ""} ${태그} ${소제목}`);
}

/** 점수 높은 순 후보 — 이미 이 글에 쓴 것은 뺀다. 같은 점수면 아직 글에 안 쓴 것, 그다음 최근 것. */
export function 후보고르기(gameId: string, 말: Set<string>, 뺄것: number[] = []): 사진[] {
  const 다 = getDb().prepare(`
    SELECT s.*, q.name AS quest_name FROM game_shots s LEFT JOIN game_quests q ON q.id = s.quest_id
    WHERE s.game_id = ? AND s.deleted_at IS NULL AND s.removed = 0 AND s.source != 'list'
    ORDER BY s.taken_at DESC LIMIT 400`).all(gameId) as (사진 & { quest_name: string | null })[];
  const 점수 = (s: 사진 & { quest_name: string | null }) => {
    const 그것 = 낱말(`${s.caption ?? ""} ${s.scene} ${s.quest_name ?? ""}`);
    let n = 0;
    for (const w of 그것) if (말.has(w)) n += 1;
    // 볼거리가 있는 장면에 덤(보스·지도·보상) — 이동 화면만 줄줄이 고르지 않게.
    if (["보스처치", "보스등장", "지도", "보상", "포획"].includes(s.scene)) n += 0.5;
    return n - (s.used_in_post ? 0.3 : 0);
  };
  return 다.filter((s) => !뺄것.includes(s.id))
    .map((s) => ({ s, n: 점수(s) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 후보수)
    .map((x) => x.s);
}

async function AI로고르기(post: Post, 후보: 사진[], 몇: number, timeoutMs: number): Promise<사진[]> {
  const 폴더 = fs.mkdtempSync(path.join(os.tmpdir(), "game-pick-"));
  try {
    const 파일 = [] as { s: 사진; f: string }[];
    for (const s of 후보) {
      const b = await 사진읽기(s.gcs_path);
      if (!b) continue;
      const f = path.join(폴더, `c${파일.length + 1}.webp`);
      fs.writeFileSync(f, b);
      파일.push({ s, f });
    }
    const prompt = `
[게임 캡처 고르기]
블로그 글 «${post.title}» 에 넣을 게임 화면 사진 ${몇}장을 아래 후보에서 골라라(Read 로 열어 보라).
${파일.map((x, i) => `${i + 1}. ${x.f} — ${x.s.scene} · ${x.s.caption ?? ""}`).join("\n")}
글 앞부분: ${(post.content ?? "").slice(0, 400)}
최종 답변은 순수 JSON 하나로만: {"selected_indices":[1,2,3]}
`.trim();
    const 값 = parseJsonLoose(await runAI({ prompt, readDir: 폴더, timeoutMs })) as { selected_indices?: number[] } | null;
    const 고른 = (값?.selected_indices ?? []).map((i) => 파일[Number(i) - 1]?.s).filter((s): s is 사진 => !!s);
    return [...new Set(고른)].slice(0, 몇);
  } finally {
    fs.rmSync(폴더, { recursive: true, force: true });
  }
}

/**
 * 글에 캡처를 붙인다. 돌려주는 것: 붙인 장수(0~몇). 모자라면 빈 자리 — 무료 이미지는 부르지 않는다.
 * append 면 이미 붙인 캡처는 빼고 새로 고른다([캡처 다시 고르기(AI)]).
 */
export async function pickGameShots(post: Post, gameId: string, 옵션: { count?: number; append?: boolean; selectTimeoutMs?: number } = {}): Promise<number> {
  const 몇 = 옵션.count ?? 3;
  const 쓴것 = 옵션.append ? 글사진들(post.id).map((s) => s.id) : [];
  const 후보 = 후보고르기(gameId, 글말(post), 쓴것);
  let 고른 = 후보.slice(0, 몇);
  if (후보.length > 몇 && (옵션.selectTimeoutMs ?? 60_000) > 0) {
    try {
      const ai = await AI로고르기(post, 후보, 몇, 옵션.selectTimeoutMs ?? 60_000);
      if (ai.length) 고른 = [...ai, ...후보.filter((s) => !ai.includes(s))].slice(0, 몇);
    } catch (탈) {
      console.warn(`[캡처 고르기] AI 없이 점수 순서로 붙입니다: ${(탈 as Error).message}`);
    }
  }
  if (!고른.length) return 0;
  return 캡처를글에(getPost(post.id)!, 고른, 옵션.append ? "append" : "replace");
}
