/**
 * **글 쓰는 방식** — 카테고리마다 고르는 작성 모드·글 구성·분량·말투 강도·내 경험,
 * 그리고 모든 글에 늘 적용하는 «작성 관점 5가지».
 *
 * 도톨이 AI 화면(글 작성 작업실)에서 보이는 «기능과 이름» 을 참고했다. 그쪽 프롬프트나
 * 내부 기준은 공개되지 않았고 복제하지 않는다 — 문구는 우리 말로 새로 썼다.
 *
 * 비워 두면(null) 예전과 같다. 지시문만 바뀌고 글쓰기 시간·도구는 그대로다.
 */

export type 작성모드 = "info" | "experience";
export type 분량 = "short" | "default" | "long";

export interface 글방식 {
  write_mode?: string | null;
  structure?: string | null;
  length_pref?: string | null;
  tone_strength?: number | null;
  my_note?: string | null;
}

export const 작성모드들: Record<작성모드, { 이름: string; 지시: string }> = {
  info: {
    이름: "정보·해석 중심",
    지시: "정보의 의미·근거·차이를 중심으로 설명한다. 1인칭 경험담은 쓰지 않는다.",
  },
  experience: {
    이름: "지식 기반 후기·경험형",
    지시: "써 본 사람의 시선으로 해석·비교한다. 다만 **실제로 겪었다고 단정하지 말고**, 경험처럼 쓴 문장은"
      + " «~해 보면», «~라는 후기가 많아요» 처럼 일반화하거나, [내 경험·요청]에 적힌 것만 1인칭으로 쓴다.",
  },
};

export interface 구성 { 번호: number; 이름: string; 한줄: string; 전개: string }

export const 글구성들: 구성[] = [
  { 번호: 1, 이름: "결론 먼저형", 한줄: "독자가 원하는 답을 먼저 보여 주고 이유를 풀어 갑니다.",
    전개: "가장 궁금한 질문의 답 → 그렇게 본 이유 → 자료·사례로 뒷받침 → 답이 달라지는 조건" },
  { 번호: 2, 이름: "궁금증 추적형", 한줄: "독자의 궁금증을 하나씩 따라가며 풀어 갑니다.",
    전개: "처음 드는 궁금증 → 알아보니 나온 사실 → 다음 궁금증 → 정리" },
  { 번호: 3, 이름: "문제 해결형", 한줄: "독자가 겪는 문제와 해결 방법을 차례로 보여 줍니다.",
    전개: "흔히 겪는 문제 → 원인 → 해결 방법 단계별 → 안 될 때 대안" },
  { 번호: 4, 이름: "비교·선택형", 한줄: "선택지를 나란히 놓고 고르는 기준을 줍니다.",
    전개: "비교 대상 소개 → 기준별 차이 → 누구에게 무엇이 맞나 → 결론" },
  { 번호: 5, 이름: "장면 출발형", 한줄: "구체적인 장면 하나로 시작해 주제로 넓혀 갑니다.",
    전개: "한 장면(상황) → 그 장면에서 생기는 질문 → 정보 → 다시 장면으로 마무리" },
  { 번호: 6, 이름: "오해 바로잡기형", 한줄: "흔한 오해를 짚고 맞는 정보로 바로잡습니다.",
    전개: "흔히 믿는 것 → 실제로는 → 왜 헷갈리나 → 제대로 아는 법" },
  { 번호: 7, 이름: "과정 따라가기형", 한줄: "처음부터 끝까지 순서대로 따라 하게 합니다.",
    전개: "준비물·조건 → 1단계 → 2단계 → … → 확인할 것" },
  { 번호: 8, 이름: "핵심 발견 확장형", 한줄: "핵심 발견 하나를 먼저 말하고 넓혀 갑니다.",
    전개: "알게 된 핵심 한 가지 → 그 의미 → 관련된 것들 → 독자에게 주는 시사점" },
  { 번호: 9, 이름: "질문 연결형", 한줄: "독자가 실제로 묻는 질문들을 이어 답합니다.",
    전개: "질문 1 → 답 → 이어지는 질문 2 → 답 → … (Q&A 흐름)" },
  { 번호: 10, 이름: "관점 제시형", 한줄: "하나의 관점을 분명히 내놓고 근거로 설득합니다.",
    전개: "내 관점 한 문장 → 근거 1·2·3 → 반대 의견과 답 → 정리" },
];

export const 분량들: Record<분량, { 이름: string; 최소: number | null; 목표: number | null }> = {
  short: { 이름: "짧게 · 1,500~2,000자", 최소: 1500, 목표: 1800 },
  default: { 이름: "기본 · 관리자 설정", 최소: null, 목표: null },
  long: { 이름: "길게 · 4,000자 안팎", 최소: 3500, 목표: 4000 },
};

/** 작성 관점 5가지 — 모든 글에 늘 붙는다. */
export const 작성관점 = `[작성 관점 — 다 쓴 뒤 스스로 점검하라]
- 개인화: 위 블로그 설정의 독자·말투·요청을 반영했는가
- 차별화: 흔한 글이 다루지 않는 쪽(조건·예외·실제로 해 볼 때 막히는 곳)을 하나 이상 담았는가
- SEO: 검색한 사람이 궁금해할 순서로 구성했는가
- GEO: 질문에 대한 답을 먼저 분명히 말하고, 근거와 조건을 쉽게 설명했는가(AI 답변에 인용되기 좋게)
- 반복 점검: 같은 정보·표현·결론을 되풀이하지 않았는가`;

const 다듬어 = (v: unknown) => String(v ?? "").trim();

export function 구성찾기(structure: string | null | undefined): 구성 | null {
  const n = Number(다듬어(structure));
  return 글구성들.find((g) => g.번호 === n) ?? null;
}

/** 이 카테고리의 분량 — 최소·목표 글자수. null 이면 관리자 설정 그대로. */
export function 분량고르기(length_pref: string | null | undefined): { 최소: number | null; 목표: number | null } {
  const 것 = 분량들[다듬어(length_pref) as 분량];
  return 것 ? { 최소: 것.최소, 목표: 것.목표 } : { 최소: null, 목표: null };
}

/** 지시문 블록. 아무것도 안 골랐으면 작성 관점만 돌려준다. */
export function 글방식블록(방식: 글방식): string {
  const 줄: string[] = [];
  const 모드 = 작성모드들[다듬어(방식.write_mode) as 작성모드];
  if (모드) 줄.push(`- 작성 모드: ${모드.이름} — ${모드.지시}`);

  const 고른구성 = 구성찾기(방식.structure);
  if (고른구성) {
    줄.push(`- 글 구성: ${고른구성.번호}. ${고른구성.이름} — ${고른구성.한줄} 전개 예: ${고른구성.전개}.`
      + " 고정 목차가 아니다. 소제목·문단 수는 자료에 맞게 조정하되 이 흐름을 따르라.");
  } else if (다듬어(방식.structure) === "auto") {
    줄.push(`- 글 구성: 아래 10가지 중 이 주제·자료에 가장 맞는 것 하나를 골라 그 흐름으로 써라 — `
      + 글구성들.map((g) => `${g.번호}.${g.이름}`).join(" · "));
  }

  const 강도 = 방식.tone_strength;
  if (강도 === 0) 줄.push("- 말투 강도 0%: 블로그 말투보다 중립적인 설명을 우선한다(구어체 ~해요는 유지).");
  else if (강도 === 100) 줄.push("- 말투 강도 100%: 위 [포스팅 방향]의 말투·표현 습관을 강하게 살린다. 1인칭 해석·비교를 적극 쓴다.");
  else if (강도 === 50) 줄.push("- 말투 강도 50%: 정보 전달과 블로그 고유 말투를 반반으로 맞춘다.");

  const 메모 = 다듬어(방식.my_note).slice(0, 800);
  if (메모) {
    줄.push(`- 내 경험·요청(블로그 주인이 직접 적은 것 — 이것만 실제 경험으로 1인칭으로 써도 된다. 없는 경험을 지어내지 마라):\n  ${메모.replace(/\n/g, "\n  ")}`);
  }

  const 머리 = 줄.length ? `[글 쓰는 방식 — 이 카테고리에서 고른 것]\n${줄.join("\n")}\n\n` : "";
  return `${머리}${작성관점}`;
}

/** 화면·API 가 받는 값을 다듬는다. 모르는 값은 null(= 자동). */
export function 글방식다듬기(body: Record<string, unknown>): 글방식 {
  const 답: 글방식 = {};
  if ("writeMode" in body) 답.write_mode = 다듬어(body.writeMode) in 작성모드들 ? 다듬어(body.writeMode) : null;
  if ("structure" in body) {
    const s = 다듬어(body.structure);
    답.structure = s === "auto" || 구성찾기(s) ? s : null;
  }
  if ("lengthPref" in body) 답.length_pref = 다듬어(body.lengthPref) in 분량들 ? 다듬어(body.lengthPref) : null;
  if ("toneStrength" in body) {
    const n = Number(body.toneStrength);
    답.tone_strength = [0, 50, 100].includes(n) && body.toneStrength !== null && body.toneStrength !== "" ? n : null;
  }
  if ("myNote" in body) 답.my_note = 다듬어(body.myNote).slice(0, 800) || null;
  return 답;
}
