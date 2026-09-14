import type { Category } from "../db/repositories/categories.js";
import type { PostDirective } from "../pipeline/directives.js";
import { buildStyleRulesBlock } from "./styleRules.js";

export function buildPostPrompt(
  category: Category,
  directive: PostDirective,
  todayIso: string,
  recentTitles: string[] = [],
): string {
  const searchInstruction = category.requires_search
    ? "이 카테고리는 반드시 웹 검색으로 실제 최신 정보를 확인해서 정확하게 반영하라. 검색 없이 추측하지 마라."
    : "이 카테고리는 검색 없이 자유롭게 창작해도 된다.";

  const recentTitlesBlock =
    recentTitles.length > 0
      ? `
최근에 이미 작성 완료한 글 제목들이다. 아래와 똑같거나 거의 같은 주제·소재·앵글로
쓰지 말고, SEO상 중복 콘텐츠로 취급되지 않도록 겹치지 않는 새로운 소재나 관점으로
작성하라:
${recentTitles.map((t) => `- ${t}`).join("\n")}
`
      : "";

  const topicKeywordBlock = category.topic_keyword
    ? `
[최우선 지시] 이번 글은 다음 키워드/주제를 최우선으로 다뤄야 한다: "${category.topic_keyword}"
반드시 웹 검색으로 이 키워드와 관련된 가장 최신 뉴스·정보·이슈를 먼저 확인하고,
그 내용을 글의 핵심 소재로 반영해서 작성하라. 이 키워드와 무관한 다른 소재로
빠지지 마라.
`
    : "";

  return `
오늘 날짜: ${todayIso}.
네이버 블로그에 올릴 포스팅을 1개 작성하라. 카테고리: ${category.name}.
카테고리 설명: ${category.prompt_hint}
${searchInstruction}
${topicKeywordBlock}
${recentTitlesBlock}
${buildStyleRulesBlock(directive)}

최종 답변은 마크다운 코드블록이나 다른 설명 없이 오직 순수 JSON 데이터 형식으로만 출력하라:
{"title": "...", "content": "...", "image_query": "...", "tags": ["#태그1", "#태그2"]}
`.trim();
}

export function buildImageSelectPrompt(
  candidateFiles: string[],
  postSummary: string,
  count: number,
): string {
  return `
다음 이미지 후보 파일들을 각각 읽어서 확인하라:
${candidateFiles.map((f, i) => `${i}: ${f}`).join("\n")}

이 이미지들은 아래 블로그 글에 들어갈 대표 이미지 후보다. 글 요약:
"""${postSummary}"""

이 글과 가장 잘 어울리는 순서대로 상위 ${count}개를 골라라. 그리고 고른 이미지마다
SEO 검색엔진이 이미지 내용을 이해할 수 있도록, 이미지가 실제로 무엇을 보여주는지
구체적으로 설명하는 한국어 대체텍스트(alt text)를 15~40자 내외로 작성하라(이
글의 주제와 자연스럽게 연결지어서). 반드시 순수 JSON으로만 답하라:
{"selected_indices": [0, 2, 4], "alt_texts": ["...", "...", "..."], "reason": "..."}
alt_texts는 selected_indices와 같은 순서, 같은 개수여야 한다.
`.trim();
}
