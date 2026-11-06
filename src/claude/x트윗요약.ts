/**
 * **📣 X(트위터) 등록용 요약문.** 이미 쓴 글(제목·본문)만 보고, X 에 소개할
 * 아주 짧은 한글 요약 + 해시태그를 만든다.
 *
 * 실제 네이버 블로그·티스토리 주소는 이 프로그램이 모른다(발행은 사람이
 * 한다 — posts.ts 의 관련글() 설명과 같은 이유) — 그래서 이 요약에는
 * **링크를 넣지 않는다.** 사람이 📣 X 등록 탭에서 실제 주소를 넣으면,
 * 화면이 복사할 때만 요약 뒤에 그 주소를 붙인다.
 *
 * 자동으로 X 에 올리지는 않는다 — 2026-11-06 검토 결과 X API 무료 등록이
 * 막혀 있어(신규 개발자는 건당 과금), 복사해서 사람이 직접 올리는 길만 쓴다.
 */
import { z } from "zod";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "./parseResponse.js";

const 답모양 = z.object({
  summary: z.string().min(1),
  hashtags: z.array(z.string().max(20)).max(2).optional().default([]),
});

export interface X요약 { text: string; hashtags: string[] }

/** 한글은 X 에서 두 글자로 센다 — 넉넉히 짧게 요청한다. */
const 목표글자수 = 110;

export function buildXSummaryPrompt(title: string, content: string): string {
  return `
[X 등록 요약 요청]
다음은 이미 완성된 블로그 글이다(실제로는 네이버 블로그 또는 티스토리에 발행됨).
- 제목: "${title}"
- 본문(일부): "${content.slice(0, 1500)}"

이 글을 X(트위터)에 소개할 **아주 짧은 한글 요약 한 문단**을 만들어라.
- ${목표글자수}자를 넘지 않게 — X 는 한글 한 글자를 두 글자로 세므로 짧을수록 좋다.
- 본문에 없는 사실·숫자는 지어내지 말 것. 과장하지 말 것.
- 전체 글을 눌러 보고 싶게 만드는 한 줄이면 된다.
- 실제 글 주소를 모르니 **링크는 쓰지 말 것** — 사람이 나중에 따로 붙인다.
- hashtags: 이 글과 실제로 관련된 짧은 해시태그 0~2개(# 없이, 띄어쓰기 없는 낱말로만).

반드시 순수 JSON 으로만 답하라: {"summary": "...", "hashtags": ["...", "..."]}
`.trim();
}

/** 글 제목·본문만으로 X 요약문을 받는다. 실패해도 글은 그대로 두고(생성만 못 함) 예외를 던진다. */
export async function 트윗요약받기(title: string, content: string): Promise<X요약> {
  const prompt = buildXSummaryPrompt(title, content);
  const 답 = await runAI({ prompt, timeoutMs: 60_000 });
  const 파싱 = 답모양.parse(parseJsonLoose(답));
  // AI 가 지시를 넘겨도 화면이 보기 흉해지지 않게 안전망을 둔다(목표의 2배까지).
  const summary = 파싱.summary.trim().slice(0, 목표글자수 * 2);
  const hashtags = 파싱.hashtags.map((h) => h.trim().replace(/^#+/, "")).filter(Boolean);
  const text = [summary, hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
  return { text, hashtags };
}
