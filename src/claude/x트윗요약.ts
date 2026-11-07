/**
 * **X(트위터)에 바로 붙여넣을 요약문.** 이미 쓴 글(제목·본문)만 보고, X 에
 * 소개할 한글 요약 + 해시태그를 만든다. 글이 만들어질 때 자동으로 같이
 * 생성되고, 📝 포스팅 카드의 [X 요약 복사하기] 버튼이 그대로 복사해 간다.
 *
 * 사장님이 쓰시는 X 계정은 **Plus(플러스) 등급** — 무료 계정(280자)과
 * 달리 한 글에 최대 25,000자까지 쓸 수 있다(2026-11-07 확인 — "Plus"가
 * 가장 낮은 유료 등급인데도 이미 긴 글·기사 작성이 포함돼 있다). 그래서
 * 예전처럼 한 줄짜리 미끼 문구로 짧게 줄일 필요가 없다 — 글의 핵심 내용을
 * 충분히 담은, 그 자체로 읽을 만한 요약을 만든다(그래도 "요약"이지 본문
 * 전체를 그대로 베끼는 것은 아니다 — 목표 분량 아래 참고).
 *
 * 실제 네이버 블로그·티스토리 주소는 이 프로그램이 모른다(발행은 사람이
 * 한다) — 그래서 이 요약에는 **링크를 넣지 않는다.** 사람이 직접 발행한 뒤
 * 그 주소를 따로 붙여 X 에 올린다(2026-11-07: 주소를 등록해 두는 별도
 * 탭·자동 합치기는 번거롭다고 보고 뺐다 — 요약만 복사해 가는 쪽으로 단순화).
 *
 * 자동으로 X 에 올리지는 않는다 — 2026-11-06 검토 결과 X API(개발자용,
 * 자동 등록)는 무료가 막혀 있어(건당 과금), 복사해서 사람이 직접 올리는
 * 길만 쓴다. 이건 사람이 X 앱/웹에서 직접 타이핑해 올리는 것이라 Plus
 * 구독료(월 정액) 말고 추가로 드는 돈은 없다.
 */
import { z } from "zod";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "./parseResponse.js";

const 답모양 = z.object({
  summary: z.string().min(1),
  hashtags: z.array(z.string().max(20)).max(2).optional().default([]),
});

export interface X요약 { text: string; hashtags: string[] }

/** X Premium+ 등급 기준 — 목표 분량(블로그 글 자체가 2,500~4,500자 안팎이라
 * 그보다 짧게, 그래도 한 줄 미끼보다는 훨씬 충분하게 잡는다). 25,000자 한도에는 넉넉히 못 미친다. */
const 목표글자수 = 1800;
/** 혹시 AI 가 지시를 크게 넘겨도, X Premium+ 한도(25,000자) 안에서 끊는 안전망. */
const 안전망글자수 = 20_000;

export function buildXSummaryPrompt(title: string, content: string): string {
  return `
[X 등록 요약 요청]
다음은 이미 완성된 블로그 글이다(실제로는 네이버 블로그 또는 티스토리에 발행됨).
- 제목: "${title}"
- 본문: "${content.slice(0, 6000)}"

이 글을 X(트위터)에 소개할 **한글 요약**을 만들어라. 이 계정은 X Premium+(플러스)
등급이라 글 하나에 최대 25,000자까지 쓸 수 있다 — 예전처럼 한 줄로 줄이지 말고,
목표 ${목표글자수}자 안팎으로 **이 글의 핵심 내용(결론·중요한 숫자·맥락)을 충분히
담아 그 자체로 읽을 만한 글**을 써라. 다만 본문을 그대로 베끼지 말고 자연스럽게
다시 쓴 요약이어야 한다.
- 본문에 없는 사실·숫자는 지어내지 말 것. 과장하지 말 것.
- 글 흐름은 자연스럽게 — 문단을 나눠도 된다.
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
  // AI 가 지시를 넘겨도 X Premium+ 한도(25,000자) 안에서는 자르지 않게 넉넉히 둔다.
  const summary = 파싱.summary.trim().slice(0, 안전망글자수);
  const hashtags = 파싱.hashtags.map((h) => h.trim().replace(/^#+/, "")).filter(Boolean);
  const text = [summary, hashtags.map((h) => `#${h}`).join(" ")].filter(Boolean).join("\n\n");
  return { text, hashtags };
}
