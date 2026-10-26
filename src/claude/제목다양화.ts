/**
 * **제목 끝맺음 다양화** — 제목규칙.ts·promptBuilder.ts 의 기존 제목 최적화 규칙은 그대로 두고,
 * 그 위에 **덧붙이는** 지시문 하나를 추가한다.
 *
 * 문제: title 은 8가지 «멈추는 이유» 중 AI 가 자유롭게 고르고, title_variants 3개는 늘 같은
 * 3가지 각도(조건·기준형/방법·절차형/후기·비교형)로 고정돼 있다. 그 결과 AI 가 매번 비슷한
 * 꼴(특히 "숫자+가지", "~하는 법")로 끝맺어, 글이 쌓이면 제목이 그 두 가지로 몰려 보인다.
 *
 * 해법은 변주.ts(src/pipeline/변주.ts) 와 같다 — **AI 의 자유 선택에 맡기지 않고 코드가 끝맺음
 * 꼴을 미리 4개(title 1개 + title_variants 3개) 서로 다르게 골라, 최근 글에서 덜 쓴 것을
 * 우선한다.** AI 는 그 안에서 자연스럽게 문장만 쓴다.
 */
import { 최근글들, 변주적기 } from "../db/repositories/posts.js";
import { 덜쓴것 } from "../pipeline/변주.js";

/** 제목 끝맺음 꼴 — 겉모습(글자 끝) 기준이라 제목규칙.ts 의 8가지 «멈추는 이유» 와는 다른 축이다. */
export const 끝맺음꼴들 = {
  count: { 꼴: "숫자 + «가지/개» 로 끝맺기", 예시: "...바뀐 한도 3가지" },
  method: { 꼴: "«~하는 법/방법» 으로 끝맺기", 예시: "...첫 작품 완성하는 법" },
  summary: { 꼴: "«~총정리/정리» 로 끝맺기", 예시: "...바뀐 점 총정리" },
  checklist: { 꼴: "«~체크리스트/확인할 것» 으로 끝맺기", 예시: "...계약 전 체크리스트" },
  reason: { 꼴: "«~하는 이유/~인 이유» 로 끝맺기", 예시: "...관심이 몰리는 이유" },
  compare: { 꼴: "두 가지를 맞세워 «~비교» 로 끝맺기", 예시: "...vs 전세 비교" },
  rank: { 꼴: "«~순위/TOP+숫자» 로 끝맺기", 예시: "...가성비 TOP5" },
  timing: { 꼴: "«~시기/타이밍» 으로 끝맺기", 예시: "...지금이 적기인 타이밍" },
  question: { 꼴: "물음표로 끝나는 물음꼴", 예시: "...몰라서 손해 보셨나요?" },
  tip: { 꼴: "«~꿀팁/노하우» 로 끝맺기", 예시: "...아는 사람만 아는 꿀팁" },
  caution: { 꼴: "«~주의할 점/실수» 로 끝맺기", 예시: "...계약 전 흔한 실수" },
  cost: { 꼴: "«~가격/비용» 으로 끝맺기", 예시: "...실제 드는 비용" },
} as const;
export type 끝맺음꼴 = keyof typeof 끝맺음꼴들;

export type 제목패턴선택 = { main: 끝맺음꼴; variants: [끝맺음꼴, 끝맺음꼴, 끝맺음꼴] };

/** 최근 글들이 title + title_variants 에 썼던 끝맺음 꼴. variation_json 에 titlePatterns 로 남겨 둔 것만 본다. */
export function 최근끝맺음들(개수 = 8): 끝맺음꼴[] {
  const 전체꼴 = new Set(Object.keys(끝맺음꼴들));
  return 최근글들(개수)
    .flatMap((g) => {
      try {
        const 기록 = JSON.parse(g.variation_json ?? "null") as { titlePatterns?: unknown } | null;
        return Array.isArray(기록?.titlePatterns) ? (기록!.titlePatterns as unknown[]) : [];
      } catch { return []; }
    })
    .filter((v): v is 끝맺음꼴 => typeof v === "string" && 전체꼴.has(v));
}

/**
 * 이번 글의 title + title_variants 3개가 쓸 끝맺음 꼴 4개를 고른다.
 * 최근 글에서 덜 쓴 꼴을 우선하고, 이번 글 안에서는 4개가 서로 겹치지 않게 뽑는다.
 */
export function 끝맺음고르기(최근: 끝맺음꼴[] = 최근끝맺음들()): 제목패턴선택 {
  let 남은 = Object.keys(끝맺음꼴들) as 끝맺음꼴[];
  const 고른것: 끝맺음꼴[] = [];
  for (let i = 0; i < 4; i++) {
    const 뽑음 = 덜쓴것(남은, 최근);
    고른것.push(뽑음);
    남은 = 남은.filter((k) => k !== 뽑음);
  }
  return { main: 고른것[0], variants: [고른것[1], 고른것[2], 고른것[3]] };
}

/** 프롬프트에 덧붙이는 지시문. 기존 [제목 규칙]·후킹 제목 3종 지시 **다음에** 추가로 붙인다. */
export function 끝맺음블록(선택: 제목패턴선택): string {
  const 적기 = (k: 끝맺음꼴) => `${끝맺음꼴들[k].꼴} (예: "${끝맺음꼴들[k].예시}")`;
  return `
[제목 끝맺음 다양화 — 위 제목 규칙·후킹 제목 3종 지시에 **더해서** 지키는 것]
최근 글들의 제목이 "~3가지", "~하는 법" 같은 꼴로 몰려서, 쌓인 글을 보면 패턴이 바로 드러난다.
이번 글은 title 과 title_variants 3개, 넷의 **끝맺음 꼴을 아래처럼 서로 다르게** 하라
(앞머리 키워드 조합·전체 길이·서술형 금지 등 위 규칙은 그대로 다 지킨 채, 뒤쪽 후킹 문구가
끝나는 모양만 아래로 바꾸면 된다. 뜻이 어색해지면 글 내용에 맞게 자연스러운 말로 바꿔도 되지만,
넷의 끝 모양은 끝까지 서로 겹치지 않아야 한다):
- title (본 제목): ${적기(선택.main)}
- title_variants[0] (조건·기준형): ${적기(선택.variants[0])}
- title_variants[1] (방법·절차형): ${적기(선택.variants[1])}
- title_variants[2] (후기·비교형): ${적기(선택.variants[2])}
`.trim();
}

/** generatePost.ts 가 글을 저장할 때 variation_json 에 같이 남긴다 — 다음 글이 덜 쓴 꼴을 고르게. */
export function 끝맺음기록적기(postId: number, 선택: 제목패턴선택, 기존변주?: unknown): void {
  const 바탕 = (기존변주 && typeof 기존변주 === "object") ? (기존변주 as Record<string, unknown>) : {};
  변주적기(postId, { ...바탕, titlePatterns: [선택.main, ...선택.variants] });
}
