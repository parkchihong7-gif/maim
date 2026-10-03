/**
 * **변주** — 글마다 도입·소제목·목록·마무리·장치·리듬을 바꾸고, 최근 글에서 쓴 시작·마무리·반복 표현을 피한다.
 *
 * 「같은 패턴이 반복돼 AI 느낌이 난다」 를 줄이려고 만들었다. 모두 AI 없이 정한다(시간 0).
 *   1) 축마다 «최근 8편에서 가장 덜 쓴 것» 을 고른다(같으면 무작위). 고른 것은 posts.variation_json 에 남긴다.
 *   2) 최근 8편의 첫 문장·마지막 문장과, 여러 글에 되풀이된 표현(세 낱말 묶음)을 «쓰지 말 것» 으로 준다.
 */
import { 최근글들 } from "../db/repositories/posts.js";
import { NON_GREETING_STYLES, PERSONAS, type OpeningStyle, type PostDirective } from "./directives.js";

export const 변주축 = {
  heading: {
    question: "소제목을 독자가 실제로 묻는 질문 꼴로 (예: 🤔 ○○은 언제 해야 할까요?)",
    noun: "소제목을 짧은 명사구로 (예: 📍 계약 당일 순서)",
    step: "소제목을 순서·단계 꼴로 (예: 1️⃣ 먼저 서류부터)",
    verdict: "소제목을 결론 한 줄로 (예: 💡 결국 날짜가 전부예요)",
    talk: "소제목을 독자에게 말 거는 꼴로 (예: 🙋 이건 꼭 물어보세요)",
  },
  emoji: {
    pin: "📍 💡 ✨", leaf: "🌱 🌿 🍀", num: "1️⃣ 2️⃣ 3️⃣ 4️⃣ 5️⃣", map: "🔎 🧭 🗂️", cafe: "☕ 📝 🙌", sign: "✅ ⚠️ 💬", star: "⭐ 🌟 💫",
  },
  list: {
    check: "목록은 ✔️ 로 시작하는 짧은 줄", arrow: "목록은 👉 로 시작하는 줄", circled: "목록은 ①②③ 원문자 번호",
    dot: "목록은 • 가운뎃점", prose: "목록을 거의 쓰지 말고 문장으로 풀어 쓰기(목록은 글 전체에 많아야 한 번)",
  },
  device: {
    qa: "한 구간은 짧은 Q&A 두세 개로 꾸며라", compare: "한 구간은 두 가지를 나란히 비교하라(A는 … B는 …)",
    mistake: "흔히 하는 실수 하나를 따로 짚는 구간을 넣어라", scene: "구체적인 장면 하나를 그리듯 보여 주는 구간을 넣어라",
    tip: "남들이 잘 안 알려 주는 팁 하나를 따로 강조하라", numbers: "숫자 몇 개로 정리하는 구간을 넣어라(근거 없는 숫자는 쓰지 마라)",
  },
  rhythm: {
    short: "짧은 문장 위주로 빠르게 읽히게", mixed: "긴 설명 문단 사이사이에 한 줄짜리 강조 문단을 섞어서",
    talk: "독자와 묻고 답하듯 대화하는 리듬으로",
  },
  closing: {
    summary: "마지막은 세 줄 요약으로 맺어라", checklist: "마지막은 «바로 해 볼 것» 세 가지로 맺어라",
    question: "마지막은 독자의 상황을 묻는 질문 하나로 맺어라(«댓글 남겨 주세요» 같은 상투 문구는 쓰지 마라)",
    next: "마지막은 다음에 할 일·순서를 안내하며 맺어라", case: "마지막은 상황별 추천(이런 분은 A, 저런 분은 B)으로 맺어라",
    short: "마지막은 요약·인사 없이 담백한 한두 문장으로 맺어라",
  },
} as const;
export type 변주축이름 = keyof typeof 변주축;
export type 고른변주 = { [K in 변주축이름]: keyof (typeof 변주축)[K] } & { opening: OpeningStyle; persona: number };

const 무작위 = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];

/** 최근 기록에서 가장 덜 쓴 것. 같으면 그중 무작위, 바로 앞 글과 같은 것은 될 수 있으면 피한다. */
export function 덜쓴것<T extends string | number>(후보: readonly T[], 최근: T[]): T {
  const 셈 = new Map<T, number>(후보.map((k) => [k, 0]));
  최근.forEach((k, i) => { if (셈.has(k)) 셈.set(k, 셈.get(k)! + (i < 2 ? 3 : 1)); });  // 최근 두 편은 무겁게
  const 최소 = Math.min(...셈.values());
  return 무작위(후보.filter((k) => 셈.get(k) === 최소));
}

const 줄들 = (글: string) => String(글 ?? "").split("\n").map((x) => x.trim()).filter(Boolean);
const 짧게 = (s: string, n = 50) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 여러 글에 되풀이된 세 낱말 묶음 — «글 n편 이상» 에 나온 것만. */
export function 반복표현(글들: string[], 최소편 = 3, 개수 = 12): string[] {
  const 셈 = new Map<string, number>();
  for (const 글 of 글들) {
    const 말 = 글.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const 본 = new Set<string>();
    for (let i = 0; i + 2 < 말.length; i++) {
      const 묶 = `${말[i]} ${말[i + 1]} ${말[i + 2]}`;
      if (묶.replace(/\s/g, "").length < 6) continue;
      본.add(묶);
    }
    for (const 묶 of 본) 셈.set(묶, (셈.get(묶) ?? 0) + 1);
  }
  return [...셈].filter(([, n]) => n >= 최소편).sort((a, b) => b[1] - a[1]).slice(0, 개수).map(([k]) => k);
}

export interface 최근모양 { 첫문장: string[]; 마무리: string[]; 반복: string[]; 기록: Partial<고른변주>[] }

export function 최근모양보기(개수 = 8): 최근모양 {
  const 글들 = 최근글들(개수);
  const 본문 = 글들.map((g) => g.final_content || g.content);
  const 기록 = 글들.map((g) => { try { return JSON.parse(g.variation_json ?? "null") ?? {}; } catch { return {}; } });
  return {
    첫문장: [...new Set(본문.map((b) => 짧게(줄들(b)[0] ?? "")).filter(Boolean))].slice(0, 5),
    마무리: [...new Set(본문.map((b) => 짧게(줄들(b).slice(-1)[0] ?? "")).filter(Boolean))].slice(0, 5),
    반복: 본문.length >= 3 ? 반복표현(본문) : [],
    기록,
  };
}

/** 이번 글의 변주를 고른다. directive 의 도입·말투 인물도 최근과 겹치지 않게 바꿔 준다. */
export function 변주고르기(directive: PostDirective, 모양: 최근모양 = 최근모양보기()): { directive: PostDirective; 변주: 고른변주 } {
  const 최근 = <K extends keyof 고른변주>(k: K) => 모양.기록.map((r) => r[k]).filter((v) => v !== undefined) as 고른변주[K][];
  const 최근도입 = 최근("opening");
  // 인사말은 최근 네 편 안에 있었으면 쓰지 않는다.
  const 도입후보: OpeningStyle[] = directive.openingStyle === "greeting" && !최근도입.slice(0, 4).includes("greeting")
    ? ["greeting"] : NON_GREETING_STYLES;
  const 변주: 고른변주 = {
    opening: 덜쓴것(도입후보, 최근도입),
    persona: 덜쓴것(PERSONAS.map((_, i) => i), 최근("persona")),
    heading: 덜쓴것(Object.keys(변주축.heading) as 고른변주["heading"][], 최근("heading")),
    emoji: 덜쓴것(Object.keys(변주축.emoji) as 고른변주["emoji"][], 최근("emoji")),
    list: 덜쓴것(Object.keys(변주축.list) as 고른변주["list"][], 최근("list")),
    device: 덜쓴것(Object.keys(변주축.device) as 고른변주["device"][], 최근("device")),
    rhythm: 덜쓴것(Object.keys(변주축.rhythm) as 고른변주["rhythm"][], 최근("rhythm")),
    closing: 덜쓴것(Object.keys(변주축.closing) as 고른변주["closing"][], 최근("closing")),
  };
  if (변주.heading === "step") 변주.emoji = "num";
  else if (변주.emoji === "num") 변주.emoji = 덜쓴것((Object.keys(변주축.emoji) as 고른변주["emoji"][]).filter((k) => k !== "num"), 최근("emoji"));
  return { directive: { ...directive, openingStyle: 변주.opening, persona: PERSONAS[변주.persona] }, 변주 };
}

/**
 * 지시문 블록. 위 서식 규칙의 «예시 이모지» 보다 이것이 먼저다(마크다운 금지는 그대로).
 * 구간: 글 작업실처럼 한 구간씩 쓸 때 — 소제목은 목차가 정하므로 빼고, 장치는 둘째 구간에만,
 * 첫 문장 피하기는 첫 구간에만, 마무리는 마지막 구간에만 준다.
 */
export function 변주블록(v: 고른변주, 모양: 최근모양, 옵션: { 구간?: { n: number; 수: number } } = {}): string {
  const 구 = 옵션.구간;
  const 처음 = !구 || 구.n === 0;
  const 끝 = !구 || 구.n === 구.수 - 1;
  const 줄: string[] = [];
  if (!구) 줄.push(`- 소제목: ${변주축.heading[v.heading]}. 소제목 이모지는 ${변주축.emoji[v.emoji]} 만 돌려 쓰고 다른 이모지로 소제목을 시작하지 마라`);
  줄.push(`- ${변주축.list[v.list]}`);
  if (!구 || 구.n === 1) 줄.push(`- ${변주축.device[v.device]}`);
  줄.push(`- 문장 리듬: ${변주축.rhythm[v.rhythm]}`);
  if (끝) 줄.push(`- ${변주축.closing[v.closing]}`);
  const 피할: string[] = [];
  if (처음 && 모양.첫문장.length) 피할.push(`- 최근 글의 첫 문장(이렇게 시작하지 마라): ${모양.첫문장.map((x) => `«${x}»`).join(" / ")}`);
  if (끝 && 모양.마무리.length) 피할.push(`- 최근 글의 마지막 문장(이렇게 맺지 마라): ${모양.마무리.map((x) => `«${x}»`).join(" / ")}`);
  if (모양.반복.length) 피할.push(`- 최근 여러 글에 되풀이된 표현(다시 쓰지 마라): ${모양.반복.map((x) => `«${x}»`).join(", ")}`);
  return `[변주 — 이 블로그의 최근 글과 다르게 써라. 위 서식 규칙의 예시 이모지·목록 기호보다 이것을 따른다(마크다운 금지는 그대로)]
${줄.join("\n")}${피할.length ? `\n[최근 글과 겹치지 않게]\n${피할.join("\n")}` : ""}`.slice(0, 1800);
}

/** 화면·기록용 한 줄. */
export function 변주요약(v: 고른변주): string {
  return [v.opening, v.heading, v.emoji, v.list, v.device, v.rhythm, v.closing].join("·");
}
