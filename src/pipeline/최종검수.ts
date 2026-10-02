/**
 * **최종 검수** — 포스팅 카드의 [🔎 최종 검수] 에서 사람이 누를 때만 돈다.
 * 아침 자동 글·[지금 생성] 은 이것을 부르지 않는다.
 *
 * AI 가 글을 6가지로 보고 «문제 문장 + 까닭 + 고칠 방향» 을 **표시만** 한다.
 * 글을 대신 고치지 않는다. 고치는 것도, 최종본으로 저장하는 것도 사람이 한다.
 * 도구 없이 글만 본다(검색·주소 열기 없음) — 그래서 사실 확인을 대신하지 못한다고 화면에 적는다.
 */
import { DateTime } from "luxon";
import { config } from "../config.js";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "../claude/parseResponse.js";

export const 검수한도ms = 120_000;
/** 체험 자리는 하루 몇 번까지 (사장님 AI 한도를 쓰므로). */
export const 체험_검수하루 = 5;

export const 검수항목 = {
  style: "내 블로그 스타일",
  principle: "작성 원칙",
  fact: "사실·숫자·출처",
  experience: "경험 표현",
  similar: "참고 자료와 비슷한 표현",
  exaggeration: "과장·단정·민감",
} as const;
export type 검수종류 = keyof typeof 검수항목;

export interface 검수지적 { kind: 검수종류; quote: string; why: string; fix: string }
export interface 검수결과 {
  counts: Record<검수종류, number>;
  items: 검수지적[];
  summary: string;
  at: string;
}

export function buildReviewPrompt(입력: { title: string; content: string; 말투?: string | null; 보강?: string | null }): string {
  const 오늘 = DateTime.now().setZone(config.timezone).toFormat("yyyy-MM-dd");
  return `
[검수 요청] 아래는 네이버 블로그에 올리기 전의 글이다. 오늘 날짜: ${오늘}.
너는 꼼꼼한 편집자다. 글을 **고쳐 쓰지 말고**, 문제가 있는 곳만 찾아 표시하라.
너에게는 검색·주소 열기 도구가 없다. 확인할 수 없는 사실은 «확인 필요» 로 표시하라.

[이 블로그의 말투·방향]
${(입력.말투 ?? "").trim() || "(따로 정한 것 없음 — 친근한 구어체 ~해요)"}
${(입력.보강 ?? "").trim() ? `보강: ${입력.보강!.trim()}` : ""}

[작성 원칙]
- 마크다운 기호(#, *, ■, ▶) 금지. 소제목·목록은 이모지로 시작
- 같은 정보·표현·결론 되풀이 금지. 질문에는 답을 먼저
- 수익·효과를 약속하는 말(무조건, 100%, 보장) 금지

[볼 것 6가지 — kind 값]
- style: 위 말투·방향에서 벗어난 문장
- principle: 작성 원칙을 어긴 곳
- fact: 근거 없는 숫자·날짜·통계·기관명, 오늘 기준으로 낡았을 수 있는 «○○년 기준»
- experience: 실제 겪은 것처럼 쓴 1인칭 경험(«제가 직접 해 보니» 등) — 사실인지 블로그 주인이 확인해야 함
- similar: 다른 글에서 흔히 보이는 베낀 듯한 문장, 상투적인 문장
- exaggeration: 과장·단정(100%, 무조건, 절대)·의료/법률/투자 단정 등 민감한 표현

[답 형식 — 다른 말 없이 JSON 하나]
{"summary": "전체 한두 문장", "items": [{"kind": "fact", "quote": "글에서 그대로 옮긴 짧은 구절(40자 이내)", "why": "왜 문제인지", "fix": "어떻게 고치면 되는지"}]}
문제가 없는 종류는 넣지 마라. items 는 많아도 15개.

[제목]
${입력.title}

[본문]
${입력.content}
`.trim();
}

const 종류들 = Object.keys(검수항목) as 검수종류[];

export function 검수답읽기(답: string): 검수결과 {
  const 날 = parseJsonLoose(답) as { summary?: unknown; items?: unknown } | null;
  const items: 검수지적[] = [];
  for (const x of Array.isArray(날?.items) ? 날!.items as Record<string, unknown>[] : []) {
    const kind = String(x?.kind ?? "") as 검수종류;
    if (!종류들.includes(kind)) continue;
    items.push({
      kind,
      quote: String(x?.quote ?? "").trim().slice(0, 120),
      why: String(x?.why ?? "").trim().slice(0, 300),
      fix: String(x?.fix ?? "").trim().slice(0, 300),
    });
    if (items.length >= 15) break;
  }
  const counts = Object.fromEntries(종류들.map((k) => [k, items.filter((i) => i.kind === k).length])) as Record<검수종류, number>;
  return { counts, items, summary: String(날?.summary ?? "").trim().slice(0, 400), at: new Date().toISOString() };
}

export async function 검수하기(입력: { title: string; content: string; 말투?: string | null; 보강?: string | null }): Promise<검수결과> {
  const 답 = await runAI({ prompt: buildReviewPrompt(입력), timeoutMs: 검수한도ms });
  return 검수답읽기(답);
}
