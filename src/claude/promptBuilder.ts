import type { Category } from "../db/repositories/categories.js";
import type { PostDirective } from "../pipeline/directives.js";
import { buildStyleRulesBlock } from "./styleRules.js";
import { buildTitleRuleBlock, 목표최소, 목표최대 } from "./제목규칙.js";
import { buildSeoRuleBlock } from "./검색노출규칙.js";

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

  // ── 주제 키워드 — 뜻을 좁혀서 준다 ─────────────────────────────
  //
  // 예전에는 «이 키워드를 최우선으로 다뤄라» 한 줄뿐이었다. 키워드가 고유명사이거나
  // 뜻이 여럿이면(«스크래치» — 코딩 교육 / 자동차 흠집 / 복권) 검색에 먼저 걸린
  // 쪽으로 흘러 전혀 다른 글이 나왔다. 그래서 카테고리 이름·설명을 «뜻의 울타리»
  // 로 세우고, 함께 들어갈 말로 좁히고, 빼야 할 말로 다른 뜻을 잘라 낸다.
  const 함께 = (category.must_keywords ?? "").trim();
  const 빼기 = (category.exclude_keywords ?? "").trim();
  const 카테고리주소 = (category.reference_urls ?? "").split(/\s+/).filter(Boolean);
  const 대표주소 = (category.main_url ?? "").trim();
  const 울타리 = `카테고리 「${category.name}」 (${category.prompt_hint})`;

  const topicKeywordBlock = category.topic_keyword
    ? `
[최우선 지시 — 이번 글의 주제 키워드] "${category.topic_keyword}"
1. 이 키워드는 반드시 ${울타리} 의 맥락에서 해석하라. 같은 글자라도 이 카테고리와 상관없는 뜻(동명이인·
   다른 회사·다른 분야의 같은 이름)이면 그 뜻이 아니다.${함께 ? `
2. 함께 들어갈 말: ${함께}
   웹 검색어는 «${category.topic_keyword} + 위 말 중 하나» 조합으로 만들어라. 키워드만 단독으로 검색하지 마라.
   본문에도 이 말들이 자연스럽게 들어가야 한다.` : `
2. 웹 검색어는 키워드만 단독으로 쓰지 말고, 카테고리 이름이나 설명의 핵심 낱말을 하나 붙여 뜻을 좁혀라.`}${빼기 ? `
3. 빼야 할 말(다른 뜻): ${빼기}
   검색 결과나 소재에 이 말이 들어간 것은 다른 뜻이므로 버려라. 본문에도 쓰지 마라.` : ""}
4. 검색 결과 후보 여러 개를 확인한 뒤, 위 맥락에 맞으면서 대중의 관심이 가장 큰 사건·이슈 하나만 골라
   깊이 있게 써라. 여러 소식을 나열·요약하는 «모음집» 으로 쓰지 마라.
5. 맥락에 맞는 최근 소식이 없으면, 다른 주제로 빠지지 말고 이 키워드의 기본 정보·최근 변화·활용법·
   주의할 점을 정리하는 글로 써라. **키워드와 무관한 소재로 바꾸는 것은 실패다.**
`
    : `${함께 || 빼기 ? `
[이 카테고리의 뜻을 좁히는 말]${함께 ? `
- 함께 들어갈 말: ${함께} — 소재와 검색어를 이 말들 근처에서 고른다.` : ""}${빼기 ? `
- 빼야 할 말(다른 뜻): ${빼기} — 이 말이 들어간 소재는 쓰지 않는다.` : ""}
` : ""}`;

  const categoryUrlBlock = 대표주소 || 카테고리주소.length
    ? `
[이 카테고리의 주소 — 글을 쓰기 전에 먼저 열어 보라]${대표주소 ? `
- 대표 주소(기준 출처, 가장 먼저): ${대표주소}` : ""}${카테고리주소.length ? `
- 참고 주소: ${카테고리주소.join(" · ")}` : ""}
대표 주소의 최신 글·공지·자료에서 이번 글의 소재를 먼저 찾고, 참고 주소로 사실과 숫자를 보강하라.
문장은 베끼지 말고 네 말로 다시 쓰고, 숫자·날짜는 출처 그대로 옮겨라. 열리지 않으면 건너뛰고 웹 검색으로 대신하라.
`
    : "";

  const titleVariantsInstruction = `
title 과 별도로, **같은 글을 다른 각도로 노리는 후킹 제목 3개**를 title_variants 에 담아라.
후보 3개도 위 [제목 규칙]을 똑같이 지킨다 — [앞머리 세부 키워드 조합 3~4낱말] + [후킹 문구],
공백 포함 ${목표최소}~${목표최대}자, 서술형 끝맺음 금지.
앞머리 키워드와 후킹 문구를 **셋 다 서로 다르게**, title 과도 다르게 잡아라:
1. 조건·기준형 — 독자가 따져 보는 것 + 손실회피·돈 후킹
   (예: "노원구 소형 아파트 대출 조건 모르고 계약하면 손해 보는 3가지")
2. 방법·절차형 — 독자가 직접 해 보려는 것 + 시간·호기심 후킹
   (예: "초등 스크래치 게임 만들기 주말 1시간이면 첫 작품 완성하는 법")
3. 후기·비교형 — 독자가 고르기 전에 찾아보는 것 + 비교·안전 후킹
   (예: "스크래치 주니어 실사용 후기 6개월 써 보고 알게 된 장단점")
`;

  return `
오늘 날짜: ${todayIso}.
${blogProfileBlock}
네이버 블로그에 올릴 포스팅을 1개 작성하라. 카테고리: ${category.name}.
카테고리 설명: ${category.prompt_hint}
${searchInstruction}
${topicKeywordBlock}
${categoryUrlBlock}
${recentTitlesBlock}
${buildStyleRulesBlock(directive)}
${buildTitleRuleBlock()}
${buildSeoRuleBlock(directive)}
${titleVariantsInstruction}

최종 답변은 마크다운 코드블록이나 다른 설명 없이 오직 순수 JSON 데이터 형식으로만 출력하라:
{"keyword": "앞머리 세부 키워드 조합(3~4낱말)", "title": "앞머리 키워드 + 후킹 문구 (${목표최소}~${목표최대}자)", "content": "...", "image_query": "...", "tags": ["#태그1", "#태그2"], "title_variants": ["조건·기준형 후킹 제목", "방법·절차형 후킹 제목", "후기·비교형 후킹 제목"]}
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
${buildTitleRuleBlock()}

최종 답변은 마크다운 코드블록이나 다른 설명 없이 오직 순수 JSON 데이터 형식으로만 출력하라:
{"title": "...", "content": "..."}
`.trim();
}

export function buildImageSelectPrompt(
  candidateFiles: string[],
  postSummary: string,
  count: number,
  postTitle = "",
): string {
  // 네이버 이미지검색이 이 블로그 유입의 24.6% 다 — 통합검색 다음으로 큰 길.
  // 그림 설명글에 글 키워드가 없으면 그 몫을 통째로 버린다.
  const 키워드줄 = postTitle
    ? `\n이 글의 제목은 "${postTitle}" 이다. **대체텍스트마다 이 제목의 핵심 키워드를\n한 번씩 자연스럽게 넣어라.** 네이버 이미지검색에서 이 글로 들어오는 길이 여기서 난다.\n단, 세 장에 똑같은 문장을 붙이지 말고 그림마다 실제로 보이는 것을 달리 적어라.`
    : "";
  return `
다음 이미지 후보 파일들을 각각 읽어서 확인하라:
${candidateFiles.map((f, i) => `${i}: ${f}`).join("\n")}

이 이미지들은 아래 블로그 글에 들어갈 대표 이미지 후보다. 글 요약:
"""${postSummary}"""

이 글과 가장 잘 어울리는 순서대로 상위 ${count}개를 골라라. 그리고 고른 이미지마다
SEO 검색엔진이 이미지 내용을 이해할 수 있도록, 이미지가 실제로 무엇을 보여주는지
구체적으로 설명하는 한국어 대체텍스트(alt text)를 15~40자 내외로 작성하라(이
글의 주제와 자연스럽게 연결지어서).${키워드줄}

반드시 순수 JSON으로만 답하라:
{"selected_indices": [0, 2, 4], "alt_texts": ["...", "...", "..."], "reason": "..."}
alt_texts는 selected_indices와 같은 순서, 같은 개수여야 한다.
`.trim();
}
