/**
 * 🕹️ 퀘스트 공략 글 만들기 (GAME_PLAN 7-4·15-7).
 *
 * 기존 `generatePost` 와 같은 모양(제목·본문·태그·후킹 제목 3종)으로 posts 에 넣는다. 다른 점:
 *   - 조사 단계가 없다 — 재료는 **내 스크린샷 설명과 이벤트 기록**(+ 고르면 참고 글 메모)
 *   - 사진 단계가 없다 — 그 퀘스트 앨범의 사진을 순서대로 붙인다(무료 이미지 안 찾음)
 *   - 본문에 `[사진 N]` 자리를 두고, 사진 N 의 대체텍스트는 그 캡처의 설명
 *   - 사진·기록에 없는 수치는 쓰지 않는다. 참고 글에서만 나온 수치는 «커뮤니티 정보 기준»
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { runAI } from "../ai/run.js";
import { parsePostResponse } from "../claude/parseResponse.js";
import { 제목고르기 } from "../claude/제목규칙.js";
import { insertDraftPost, addPostImages, markReady, getPost, type Post } from "../db/repositories/posts.js";
import { listAllCategories, type Category } from "../db/repositories/categories.js";
import {
  퀘스트읽기, 퀘스트사진들, 퀘스트고치기, 진행표, 최근기록, 글사진적기, 게임설정읽기, 프로필읽기, type 퀘스트, type 사진,
} from "../db/repositories/gamePlay.js";
import { 사진읽기 } from "../game/사진저장.js";
import { 글순서값, 빠진것 } from "../game/미션.js";
import { 참고글읽기, 메모유효일, type 참고주소 } from "../game/참고글.js";

export const 글한도ms = 300_000;

/** 공략 글을 넣을 카테고리 — 이 게임을 연결한 카테고리 → 이름에 게임명이 있는 것 → «게임» 이 들어간 것 → 첫 카테고리. */
export function 게임카테고리(gameId: string, 게임이름: string): Category | null {
  const 다 = listAllCategories();
  return 다.find((c) => (c as Category & { game_id?: string | null }).game_id === gameId)
    ?? 다.find((c) => c.name.includes(게임이름))
    ?? 다.find((c) => /게임|game/i.test(`${c.name} ${c.prompt_hint ?? ""}`))
    ?? 다[0] ?? null;
}

function 사진고르기(q: 퀘스트): 사진[] {
  // 앨범에서 사람이 순서를 정했으면 그대로, 아니면 장면 순서(지도 → 이동 → 도착 → 대화 → 전투 → 보상).
  const 앨범 = 퀘스트사진들(q, false).filter((s) => s.source !== "list");
  if (q.shot_order_json) return 앨범.slice(0, 12);
  return [...앨범].sort((a, b) => 글순서값(a.scene) - 글순서값(b.scene) || a.taken_at.localeCompare(b.taken_at)).slice(0, 12);
}

export function 공략지시문(값: {
  게임: string; q: 퀘스트; 사진들: 사진[]; 이벤트: string[]; 참고메모: string; 참고주소: 참고주소[]; 목록넣기: boolean; 부족: string[];
}): string {
  const { 게임, q } = 값;
  return `
[게임 공략 글 쓰기]
네이버 블로그에 올릴 게임 공략 글을 한국어로 써라. 발행은 사람이 직접 한다.
게임: ${게임}
퀘스트: ${q.name} (${q.kind}) · 상태: ${q.status === "직접플레이대기" ? "자동 진행으로 못 끝냄(직접 플레이 필요)" : "완료"}
${q.stuck_reason ? `막힌 까닭: ${q.stuck_reason}\n` : ""}
■ 내 스크린샷 (이 순서대로 본문에 [사진 N] 자리를 둔다)
${값.사진들.map((s, i) => `[사진 ${i + 1}] 장면=${s.scene} · ${s.caption || "(설명 없음)"}`).join("\n") || "(사진 없음)"}

■ 플레이 기록 (시간순)
${값.이벤트.join("\n") || "(없음)"}
${값.부족.length ? `\n■ 못 찍은 장면: ${값.부족.join(", ")} — 그 부분은 사진 없이 짧게 설명만.\n` : ""}${값.참고메모 ? `\n■ 참고 글 메모 (사실 확인·보충용. 문장을 베끼지 마라)\n${값.참고메모}\n` : ""}
■ 규칙
- 제목: «${게임} ${q.name} 공략» 으로 시작하는 32~40자, 뒤에 후킹 문구. title_variants 3개(질문형·숫자/사실형·공감형).
- keyword: «${게임} ${q.name} 공략»
- 본문: 퀘스트 받는 곳 → 이동 경로(지도) → 도착·대화 → 전투/보스 → 보상 순서. 소제목은 이모지로 연다.
- 사진 자리는 본문 안에 따로 한 줄로 [사진 1], [사진 2] … 처럼. 위 사진 개수만큼 모두 쓴다.
- **사진과 기록에 없는 수치(드랍률·보상 수량·요구 레벨)는 지어내지 마라.**
- 수치는 내 사진·기록 → 공식 → 참고 글 순서로 믿는다. 참고 글에서만 나온 수치 뒤에는 «(커뮤니티 정보 기준)» 을 붙여라.
- 내 플레이와 참고 글이 다르면 내 플레이를 따르고 «패치로 바뀌었을 수 있음» 을 한 줄 넣어라.
${q.status === "직접플레이대기" ? "- 보스를 못 잡았거나 자동 진행이 막혔다면 그 사실을 솔직히 쓰고 팁만 정리하라.\n" : ""}${값.목록넣기 && 값.참고주소.length ? `- 글 끝에 «참고한 글» 목록: ${값.참고주소.map((a) => `${a.kind} — ${a.title || a.url}`).join(" / ")}\n` : ""}- 과장 광고 문구 금지. 본문은 1,500자 이상.
- image_query 는 «${게임} ${q.name}» 로 둔다(무료 이미지는 찾지 않는다).
- tags: # 으로 시작하는 5개.

최종 답변은 다른 설명 없이 순수 JSON 하나로만:
{"title":"…","content":"…","image_query":"…","tags":["#…"],"title_variants":["…","…","…"],"keyword":"…"}
`.trim();
}

/** 사진 파일을 글 폴더로 옮겨 붙인다 — 기존 📝 포스팅 카드가 그대로 보여 주고 내려받게 한다. */
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
    대체.push(s.caption || `${s.scene} 장면`);
    쓴것.push(s.id);
  }
  addPostImages(post.id, 경로들, 대체, 방식 === "append");
  글사진적기(post.id, 쓴것, 방식);
  return 경로들.length;
}

export async function generateGamePost(questId: number, 참고쓰기 = true): Promise<Post> {
  const q = 퀘스트읽기(questId);
  if (!q) throw new Error("퀘스트를 찾을 수 없습니다.");
  const 프로필 = 프로필읽기(q.game_id);
  const 게임 = 프로필?.이름 ?? q.game_id;
  const category = 게임카테고리(q.game_id, 게임);
  if (!category) throw new Error("글을 넣을 카테고리가 없습니다. [블로그 관리] 에서 하나 만들어 주세요.");

  const 사진들 = 사진고르기(q);
  const 이벤트 = 최근기록(300, q.game_id)
    .filter((e) => Number(e.detail.quest_id) === q.id)
    .reverse()
    .map((e) => `${e.at.slice(11, 16)} ${e.kind}${e.detail.이유 ? ` — ${e.detail.이유}` : ""}${e.detail.장면 ? ` (${e.detail.장면})` : ""}`)
    .slice(-30);

  // 참고 글 — 메모가 7일 안이면 다시 읽지 않는다.
  let 주소들: 참고주소[] = JSON.parse(q.ref_links_json || "[]");
  let 메모 = "";
  if (참고쓰기 && 주소들.length) {
    const 신선 = q.ref_brief && q.ref_brief_at && Date.now() - Date.parse(q.ref_brief_at) < 메모유효일 * 86_400_000;
    if (신선) 메모 = q.ref_brief!;
    else {
      try {
        const 읽음 = await 참고글읽기(게임, q.name, 주소들);
        메모 = 읽음.메모;
        주소들 = 읽음.주소들;
        퀘스트고치기(q.id, { ref_brief: 메모 || null, ref_brief_at: new Date().toISOString(), ref_links_json: JSON.stringify(주소들) });
      } catch (탈) {
        console.warn(`[공략 글] 참고 글을 못 읽었습니다 — 참고 없이 씁니다: ${(탈 as Error).message}`);
      }
    }
  }

  const prompt = 공략지시문({
    게임, q, 사진들, 이벤트, 참고메모: 메모, 참고주소: 참고쓰기 ? 주소들.filter((a) => a.state === "읽음") : [],
    목록넣기: 게임설정읽기().참고글목록넣기, 부족: 빠진것(진행표(q).칸),
  });
  let parsed;
  try {
    parsed = parsePostResponse(await runAI({ prompt, timeoutMs: 글한도ms }));
  } catch {
    parsed = parsePostResponse(await runAI({ prompt: `${prompt}\n\n(주의: 이전 응답이 올바른 JSON 이 아니었다. 순수 JSON 객체 하나만.)`, timeoutMs: 글한도ms }));
  }
  const 앞머리 = `${게임} ${q.name} 공략`;
  const 제목 = 제목고르기(parsed.post.title, parsed.post.title_variants, parsed.post.keyword || 앞머리);
  const post = insertDraftPost({
    categoryId: category.id, title: 제목.title, content: parsed.post.content,
    imageQuery: parsed.post.image_query || `${게임} ${q.name}`, tags: parsed.post.tags, titleVariants: 제목.title_variants,
  });
  getDb().prepare("UPDATE posts SET source = 'game', game_quest_id = ?, kw = ? WHERE id = ?").run(q.id, 앞머리, post.id);
  await 캡처를글에(getPost(post.id)!, 사진들);
  퀘스트고치기(q.id, { status: "글완료", post_id: post.id });
  markReady(post.id);
  return getPost(post.id)!;
}
