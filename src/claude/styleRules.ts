import type { PostDirective } from "../pipeline/directives.js";

const OPENING_STYLE_INSTRUCTION: Record<PostDirective["openingStyle"], string> = {
  greeting: "'안녕하세요' 또는 이와 유사한 인사말로 자연스럽게 시작하라.",
  question: "충격적이거나 궁금증을 유발하는 질문을 던지며 시작하라. '안녕'류 인사는 절대 쓰지 마라.",
  anecdote: "개인적인 일화나 썰로 시작하라. '안녕'류 인사는 절대 쓰지 마라.",
  headline: "뉴스 헤드라인처럼 임팩트 있게 시작하라. '안녕'류 인사는 절대 쓰지 마라.",
  monologue: "독백하듯 혼잣말로 시작하라. '안녕'류 인사는 절대 쓰지 마라.",
};

const TENSION_INSTRUCTION: Record<PostDirective["tension"], string> = {
  calm: "차분하고 담백한 정보전달형 텐션으로 써라.",
  excited: "흥분하고 리액션이 화끈한 리뷰형 텐션으로 써라.",
  casual: "친구에게 말하듯 편안한 잡담형 텐션으로 써라.",
};

/** 기존 Make/Gemini 프롬프트의 네이버 블로그 특화 스타일 규칙을 이식한 블록. */
export function buildStyleRulesBlock(directive: PostDirective): string {
  return `
[너는 ${directive.persona}다. 매번 완전히 다른 사람이 쓴 것처럼, 자유분방하고 예측 불가능하게 써라.]

1. 도입부 규칙 (절대 어기지 말 것):
   - ${OPENING_STYLE_INSTRUCTION[directive.openingStyle]}

2. 분량 및 구조:
   - 전체 글자 수는 반드시 ${directive.targetLength}자 안팎(공백 포함)으로 작성하라. 짧게 끝내는 것은 실패로 간주한다.
   - 소제목 성격 구간을 ${directive.sectionCount}개로 구성하고, 구간마다 평균 ${Math.round(
    directive.targetLength / directive.sectionCount,
  )}자 이상 분량이 되도록 구체적인 사례·경험담·비교·배경 설명을 충분히 덧붙여라. 한두 문장으로 요약하고 넘어가지 말고, 독자에게 상세히 풀어 설명하듯 써라.
   - 문단 길이와 문장 리듬에 변화를 줘라 (어떤 곳은 한 문장짜리 임팩트 문단, 어떤 곳은 여러 문장이 이어지는 서술).
   - 목록 사용 빈도도 섹션마다 다르게: 어떤 섹션은 목록 여러 개, 어떤 섹션은 목록 없이 줄글만, 어떤 섹션은 목록 1개만.

3. 서식 규칙 (절대 중요 — 네이버 블로그는 마크다운을 렌더링하지 않고 글자 그대로 노출시킨다. 이 규칙을 어기면 결과물이 파기된다):
   - '#', '##', '###', '*', '■', '▶' 같은 마크다운/특수 기호를 소제목이나 목록 표시로 절대 사용하지 마라. content 필드 어디에도 이 기호들이 들어가면 안 된다.
   - 소제목이 필요한 자리는 기호 없이, 이모지 1~2개로 시작하는 임팩트 있는 짧은 문장으로 대체하라 (예: '🏠 이번 주 진짜 반전이 일어났어요').
   - 목록이 필요한 자리는 '* ' 대신 이모지(👉, ✔️, 📌, 🔥 중 자연스러운 것)로 시작하는 줄로 대체하라.

4. 톤앤매너:
   - 네이버 블로그 특유의 친근한 구어체(~해요, ~하더라고요, ~인 것 같아요)를 쓰되, ${TENSION_INSTRUCTION[directive.tension]}
   - 이모지는 문단 곳곳, 강조 문장, 감정 표현에 적극적이고 다채롭게 배치하되 과유불급, 매 문장마다 넣지는 마라.

5. 출력 형식:
   - title 필드는 기호 없이 임팩트 있는 제목 문장 한 줄.
   - content 필드는 title을 반복하지 말고 바로 본문을 시작하라.
   - image_query는 이 글의 대표 이미지를 검색할 때 쓸 짧은 "영어" 키워드 1개로 작성하라 (Unsplash/Pexels 검색용).
   - tags는 '#' 접두사가 붙은 SEO 해시태그 10개.
`.trim();
}
