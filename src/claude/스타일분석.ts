/**
 * **🎨 내 블로그 분석** — 공개 글을 AI 가 읽고 «스타일» 과 «진단» 을 낸다. 사람이 고쳐서 승인한다.
 *
 * 도톨이 AI 의 «내 블로그 스타일 분석·블로그 진단» 화면에서 기능과 흐름만 참고했다.
 * 그쪽 기준·점수·프롬프트는 공개되지 않았고 복제하지 않는다 — 항목과 문구는 우리 말로 새로 썼다.
 *
 * 승인한 스타일만, [적용] 을 체크했을 때만 글쓰기 지시문에 들어간다. 진단은 화면에만 보인다.
 */
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "./parseResponse.js";
import type { 내글, 블로그숫자 } from "../naver/내블로그.js";

export const 분석한도ms = 180_000;
/** 체험 자리는 하루 몇 번까지 (사장님 AI 한도를 쓰므로). */
export const 체험_분석하루 = 3;

/** 스타일 칸 — 사람이 고칠 수 있고, 승인하면 글쓰기에 들어간다. */
export const 스타일칸 = {
  topic: "주로 다루는 주제",
  readers: "예상 독자",
  tone: "말투",
  title_style: "제목 방식",
  sentence_style: "문장 특징",
  paragraph_style: "문단·구성",
  experience_style: "경험 표현",
  habits: "자주 쓰는 표현(느낌만 살리고 그대로 반복하지 않기)",
  avoid: "피할 것",
  conditions: "작성 조건",
} as const;
export type 스타일키 = keyof typeof 스타일칸;

export interface 개선 { title: string; why: string; how: string; /** 글쓰기에 반영(기본 참). ③ 에서 끌 수 있다 */ use: boolean }
export interface 분석결과 {
  style: Record<스타일키, string>;
  summary: string;
  strengths: string[];
  improvements: 개선[];
  priority: string[];
  confidence: number | null;
}

const 숫자줄 = (s: 블로그숫자) => [
  `글 ${s.글수}편(본문까지 읽은 글 ${s.본문수}편) · 기간 ${s.기간 || "알 수 없음"} · 주당 ${s.주당 ?? "?"}편`,
  `카테고리: ${s.카테고리.map((c) => `${c.이름} ${c.수}`).join(", ") || "없음"}`,
  `제목 평균 ${s.제목평균}자 · 숫자 든 제목 ${s.제목숫자}% · 물음표 제목 ${s.제목물음}%`,
  `본문 평균 ${s.본문평균 ?? "?"}자(공백 빼고) · 문단 평균 ${s.문단평균 ?? "?"}자 · «~요» 끝맺음 ${s.요체 ?? "?"}% · 이모지 쓰는 글 ${s.이모지 ?? "?"}%`,
].join("\n");

export function buildStylePrompt(posts: 내글[], 숫자: 블로그숫자): string {
  let 남은 = 16_000;
  const 글줄: string[] = [];
  posts.forEach((p, i) => {
    const 몸 = p.body ? p.body.slice(0, 1800) : p.summary;
    const 줄 = `── 글 ${i + 1} [${p.date}] [${p.category || "-"}] ${p.title}\n${몸}`;
    if (남은 - 줄.length < 0) { 글줄.push(`── 글 ${i + 1} [${p.date}] ${p.title}`); return; }
    남은 -= 줄.length;
    글줄.push(줄);
  });
  return `
[스타일 분석 요청] 아래는 한 네이버 블로그의 공개 글들(최근 순)이다. 블로그 주인이 앞으로 AI 로 초안을 쓸 때
«이 블로그답게» 쓰도록, 이 블로그의 스타일을 정리하고 진단하라.
- 문장을 길게 옮기지 마라. 특징을 «설명» 하라. 자주 쓰는 표현은 짧은 예만(각 15자 이내).
- 근거가 적으면 추측이라고 밝혀라. 글에 없는 사실(경력·자격·수익 등)을 지어내지 마라.
- 진단은 블로그 주인에게 도움이 되게, 구체적으로(«무엇을 → 어떻게»). 수익·순위를 약속하는 말 금지.

[셈한 숫자 — 프로그램이 직접 센 것]
${숫자줄(숫자)}

[답 형식 — 다른 말 없이 JSON 하나]
{"style": {${Object.entries(스타일칸).map(([k, v]) => `"${k}": "${v} — 1~3문장"`).join(", ")}},
 "summary": "이 블로그를 한두 문장으로",
 "strengths": ["강점 3개"],
 "improvements": [{"title": "개선할 점(6개까지)", "why": "왜", "how": "어떻게"}],
 "priority": ["가장 먼저 할 것 3개, 순서대로"],
 "confidence": 0.0~1.0 (글이 적거나 요약만 있으면 낮게)}

[글]
${글줄.join("\n\n")}
`.trim();
}

const 글 = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** AI 답이든 사람이 고친 값이든 같은 모양으로 다듬는다. */
export function 분석다듬기(날: any): 분석결과 {
  const style = Object.fromEntries(Object.keys(스타일칸).map((k) => [k, 글(날?.style?.[k], 400)])) as Record<스타일키, string>;
  const 목록 = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => 글(x, 200)).filter(Boolean).slice(0, n);
  const c = Number(날?.confidence);
  return {
    style,
    summary: 글(날?.summary, 300),
    strengths: 목록(날?.strengths, 3),
    improvements: (Array.isArray(날?.improvements) ? 날.improvements : []).map((x: any) => ({
      title: 글(x?.title, 120), why: 글(x?.why, 300), how: 글(x?.how, 300), use: x?.use !== false,
    })).filter((x: 개선) => x.title).slice(0, 6),
    priority: 목록(날?.priority, 3),
    confidence: Number.isFinite(c) && 날?.confidence !== null && 날?.confidence !== "" ? Math.min(1, Math.max(0, c)) : null,
  };
}

export function 분석답읽기(답: string): 분석결과 {
  const 날 = parseJsonLoose(답);
  if (!날 || typeof 날 !== "object") throw new Error("AI 답을 읽지 못했습니다. 다시 눌러 주세요.");
  const r = 분석다듬기(날);
  if (!Object.values(r.style).some(Boolean)) throw new Error("AI 답에 스타일 내용이 없습니다. 다시 눌러 주세요.");
  return r;
}

export async function 스타일분석하기(posts: 내글[], 숫자: 블로그숫자): Promise<분석결과> {
  return 분석답읽기(await runAI({ prompt: buildStylePrompt(posts, 숫자), timeoutMs: 분석한도ms }));
}

/** 글쓰기 지시문에 넣는 블록. 빈 칸은 뺀다. 1400자를 넘지 않는다. */
export function 승인스타일블록(style: Partial<Record<스타일키, string>>): string {
  const 줄 = (Object.keys(스타일칸) as 스타일키[])
    .map((k) => [스타일칸[k], String(style[k] ?? "").trim().replace(/\s+/g, " ")] as const)
    .filter(([, v]) => v)
    .map(([이름, v]) => `- ${이름}: ${v.slice(0, 220)}`);
  if (!줄.length) return "";
  return `[내 블로그 스타일 — 블로그 주인이 확인·승인한 것. 이 스타일로 써라. 예시 문장을 그대로 베끼지는 마라]\n${줄.join("\n")}`.slice(0, 1400);
}

/** 검수(B)의 «내 블로그 스타일» 항목이 볼 말투 설명. */
export function 검수용스타일(style: Partial<Record<스타일키, string>>): string {
  return (["tone", "sentence_style", "paragraph_style", "title_style", "avoid"] as 스타일키[])
    .map((k) => (style[k] ? `${스타일칸[k]}: ${style[k]}` : "")).filter(Boolean).join("\n").slice(0, 900);
}

/**
 * ③ 블로그 진단을 글쓰기에 — 체크해 둔 개선점(무엇을 → 어떻게)과 «먼저 할 것». 900자를 넘지 않는다.
 * 진단은 «블로그 전체» 에 대한 것이라, 이번 글 한 편에서 할 수 있는 만큼만 지키라고 한다.
 */
export function 진단블록(a: Pick<분석결과, "improvements" | "priority">): string {
  const 개선들 = a.improvements.filter((x) => x.use !== false);
  if (!개선들.length && !a.priority.length) return "";
  const 줄 = 개선들.map((x) => `- ${x.title}${x.how ? ` → ${x.how}` : ""}`);
  if (a.priority.length) 줄.push(`- 먼저 할 것: ${a.priority.join(" / ")}`);
  줄.push("- (경험·사례를 늘리라는 개선점도 실제 경험은 [내 경험·요청]에 적힌 것만 1인칭으로 쓴다. 없으면 «~해 보면» 처럼 일반화하고 지어내지 마라)");
  return `[내 블로그 진단 — 블로그 주인이 승인한 개선점. 이번 글에서 할 수 있는 만큼 반영하라]\n${줄.join("\n")}`.slice(0, 900);
}
