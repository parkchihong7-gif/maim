import type { Category } from "../db/repositories/categories.js";
import type { PostDirective } from "../pipeline/directives.js";
import { buildStyleRulesBlock } from "./styleRules.js";

export function buildPostPrompt(category: Category, directive: PostDirective, todayIso: string): string {
  const searchInstruction = category.requires_search
    ? "이 카테고리는 반드시 웹 검색으로 실제 최신 정보를 확인해서 정확하게 반영하라. 검색 없이 추측하지 마라."
    : "이 카테고리는 검색 없이 자유롭게 창작해도 된다.";

  return `
오늘 날짜: ${todayIso}.
네이버 블로그에 올릴 포스팅을 1개 작성하라. 카테고리: ${category.name}.
카테고리 설명: ${category.prompt_hint}
${searchInstruction}

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

이 글과 가장 잘 어울리는 순서대로 상위 ${count}개를 골라라. 반드시 순수 JSON으로만 답하라:
{"selected_indices": [0, 2, 4], "reason": "..."}
`.trim();
}
