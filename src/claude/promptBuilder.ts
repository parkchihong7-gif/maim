import type { Category } from "../db/repositories/categories.js";
import type { PostDirective } from "../pipeline/directives.js";
import { buildStyleRulesBlock } from "./styleRules.js";

export function buildPostPrompt(
  category: Category,
  directive: PostDirective,
  todayIso: string,
  recentTitles: string[] = [],
  blogProfileBlock = "",
): string {
  const searchInstruction = category.requires_search
    ? `이 카테고리는 반드시 웹 검색으로 실제 최신 정보를 확인해서 정확하게 반영하라. 검색 없이 추측하지 마라.
단, 이번 달/이번 주 소식을 여러 건 나열하며 정리하는 "월간 총정리"나 "이슈 모음집" 형태로 쓰지 마라.
검색으로 찾은 여러 후보 뉴스·이슈 중에서, 실제로 대중의 관심이 크다고 판단되는 것(여러 매체가
동시에 비중 있게 다뤘거나, 반응·댓글·공유가 많이 달렸을 법한 것) 딱 하나만 골라, 그 사건 하나에
집중해서 마치 그 소식을 직접 접하고 반응하는 사람처럼 깊이 있는 리뷰/의견 글로 작성하라.`
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
반드시 웹 검색으로 이 키워드와 관련된 최근 뉴스·이슈 후보를 여러 개 확인한 뒤, 그중
대중의 관심이 가장 크다고 판단되는(여러 매체에서 비중 있게 다뤘거나 댓글·반응·공유가
많이 달렸을 법한) 사건 하나만 선정하라. 절대 여러 소식을 나열해서 요약 정리하는 방식으로
쓰지 말고, 선정한 그 하나의 사건·이슈에 집중해서 깊이 있게 써라. 이 키워드와 무관한 다른
소재로 빠지지 마라.
`
    : "";

  return `
오늘 날짜: ${todayIso}.
${blogProfileBlock}
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

/**
 * "예시 포스팅" 미리보기 전용. 실제 카테고리/검색 없이, 블로그 전역 설정만으로
 * 짧은 샘플 글 1건을 빠르게 만들어서 톤/스타일을 미리 확인하게 한다.
 */
export function buildPreviewPrompt(directive: PostDirective, blogProfileBlock: string): string {
  return `
아래는 이 블로그의 톤/스타일을 미리 확인하기 위한 짧은 샘플 포스팅이다. 검색 없이,
아래 설정에 맞는 아무 가벼운 일상 주제나 골라서 짧게 써라.
${blogProfileBlock || "(특별히 지정된 블로그 전역 설정 없음 — 기본 스타일 규칙만 따른다.)"}
${buildStyleRulesBlock(directive)}

최종 답변은 마크다운 코드블록이나 다른 설명 없이 오직 순수 JSON 데이터 형식으로만 출력하라:
{"title": "...", "content": "..."}
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
