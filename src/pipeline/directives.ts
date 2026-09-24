import { 최소분량 } from "../db/repositories/settings.js";
export type OpeningStyle = "greeting" | "question" | "anecdote" | "headline" | "monologue";
export type Tension = "calm" | "excited" | "casual";

export interface PostDirective {
  openingStyle: OpeningStyle;
  tension: Tension;
  persona: string;
  targetLength: number;
  sectionCount: number;
}

const NON_GREETING_STYLES: OpeningStyle[] = ["question", "anecdote", "headline", "monologue"];
const TENSIONS: Tension[] = ["calm", "excited", "casual"];
const PERSONAS = [
  "10년차 업계 전문가처럼 담백하게 정보를 전달하는 파워블로거",
  "감정 기복이 크고 리액션이 화끈한 리뷰 전문 인플루언서",
  "친한 친구에게 수다 떨듯 편하게 쓰는 일상 블로거",
  "데이터와 팩트를 좋아하는 분석형 블로거",
  "유행에 민감하고 트렌디한 말투를 쓰는 젊은 블로거",
];

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * 카테고리 묶음(배치) 단위로 다양성 조건을 사전 배정한다.
 * "3개 중 1개만 인사말 오프닝 가능" 같은 규칙을 모델의 자율성이 아닌
 * 오케스트레이터 코드로 보장하기 위함 (원래 Make 프롬프트의 핵심 요구사항).
 */
export function assignDirectives(n: number): PostDirective[] {
  if (n <= 0) return [];

  const greetingIndex = Math.floor(Math.random() * n);
  const shuffledStyles = shuffle(NON_GREETING_STYLES);
  const shuffledTensions = shuffle(TENSIONS);
  const shuffledPersonas = shuffle(PERSONAS);

  const directives: PostDirective[] = [];
  const 최소 = 최소분량();
  let nonGreetingCursor = 0;
  for (let i = 0; i < n; i++) {
    const openingStyle: OpeningStyle =
      i === greetingIndex
        ? "greeting"
        : shuffledStyles[nonGreetingCursor++ % shuffledStyles.length];
    directives.push({
      openingStyle,
      tension: shuffledTensions[i % shuffledTensions.length],
      persona: shuffledPersonas[i % shuffledPersonas.length],
      // **목표는 최소 기준보다 넉넉히 위에 둔다.**
      //
      // 모델은 「3,000자로 써라」 하면 대개 그보다 적게 쓴다. 목표를 최소와
      // 같게 두면 거의 매번 모자라서 다시 쓰게 되고, 그만큼 시간이 곱으로
      // 든다. 처음부터 30~60% 위를 겨누면 대개 한 번에 기준을 넘는다.
      targetLength: 최소 + Math.floor(최소 * (0.3 + Math.random() * 0.3)),
      sectionCount: 3 + Math.floor(Math.random() * 3),
    });
  }
  return directives;
}
