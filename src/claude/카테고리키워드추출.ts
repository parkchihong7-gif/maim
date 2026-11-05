/**
 * **카테고리 핵심 키워드 자동 채우기** — ①주제·②설명만 간단히 적어도,
 * ③주제 키워드·④함께 들어갈 말을 AI 가 한 번 뽑아 채워 준다.
 *
 * ①②만 채우고 ③④ 를 비워 두면, 글쓰기는 짧은 이름과 한두 줄 설명만 보고
 * 소재를 고른다 — 그러면 블로그 전역에 설정해 둔 넓은 주제 쪽으로 쏠리기
 * 쉽다(blogProfile.ts 의 전역 설정 블록 참고). ③④ 를 채워 두면 이 카테고리
 * 만의 좁은 소재·검색어가 매 글 프롬프트에 "최우선 지시"로 들어간다
 * (promptBuilder.ts 의 topicKeywordBlock) — 그래서 자동으로라도 채우는
 * 것이 이 카테고리의 글이 소주제에 머물게 하는 데 직접 도움이 된다.
 *
 * AI 를 한 번 부르고 끝이다. 결과는 **화면 입력칸에 채워만 준다** — 저장은
 * 사람이 [추가]/[수정 저장] 을 눌러야 되고, 그 전에 고쳐 쓸 수도 있다.
 */
import { z } from "zod";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "./parseResponse.js";

const 답모양 = z.object({
  topicKeyword: z.string().max(60).optional().default(""),
  mustKeywords: z.array(z.string().max(30)).max(6).optional().default([]),
});

export interface 키워드제안 { topicKeyword: string; mustKeywords: string }

export function buildKeywordSuggestPrompt(이름: string, 설명: string, 기존주제키워드: string, 기존함께: string): string {
  return `
[카테고리 키워드 추천]
다음은 네이버 블로그 카테고리 하나의 이름과 설명이다.
- 주제: "${이름}"
- 설명: "${설명}"${기존주제키워드 ? `\n- 이미 적어 둔 주제 키워드: "${기존주제키워드}"` : ""}${기존함께 ? `\n- 이미 적어 둔 "함께 들어갈 말": "${기존함께}"` : ""}

이 카테고리로 매번 글을 쓸 때 AI 에게 줄 **검색 최적화용 키워드**를 뽑아라.
- topicKeyword: 이 카테고리를 가장 잘 대표하는 세부 검색어 하나. 사람이 검색창에 그대로 칠 법한,
  띄어쓰기 기준 2~4낱말짜리 구체적인 조합이어야 한다(너무 넓은 한 낱말은 안 된다.
  예: "게임" 이 아니라 "스타듀밸리 농사 꿀팁", "맛집" 이 아니라 "노원구 직장인 점심 맛집").
- mustKeywords: 이 주제의 뜻을 좁혀 주는 연관 핵심어 3~5개. 이름이 고유명사이거나 뜻이
  여럿일 때 특히 중요하다(예: "스크래치" 라면 "코딩", "초등" 처럼 그 뜻 쪽으로 좁히는 말).

설명에 없는 사실은 지어내지 말고, 이름·설명 글자 그대로의 범위 안에서만 추론하라.
반드시 순수 JSON 으로만 답하라: {"topicKeyword": "...", "mustKeywords": ["...", "..."]}
`.trim();
}

/** 이름·설명만으로(저장 전 카테고리라도) AI 에게 주제 키워드·함께 들어갈 말을 한 번 물어본다. */
export async function 키워드제안받기(
  이름: string, 설명: string, 기존주제키워드 = "", 기존함께 = "",
): Promise<키워드제안> {
  const prompt = buildKeywordSuggestPrompt(이름, 설명, 기존주제키워드, 기존함께);
  const 답 = await runAI({ prompt, timeoutMs: 60_000 });
  const 파싱 = 답모양.parse(parseJsonLoose(답));
  return {
    topicKeyword: 파싱.topicKeyword.trim(),
    mustKeywords: 파싱.mustKeywords.map((x) => x.trim()).filter(Boolean).join(", "),
  };
}
