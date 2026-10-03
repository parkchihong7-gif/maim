/**
 * **✍️ 글 작업실** — 사람이 단계마다 확인·승인하며 한 편을 쓰는 수동 흐름. 아침 자동 글과 따로 돈다.
 *
 *   ① 키워드·검색 방향   보관함 키워드(또는 직접) + 연관어 중 다룰 방향 고르기
 *   ② 상위 5개·사전 지식  네이버 블로그 상위 5편을 읽어 숫자(글자수·소제목·자주 낱말)를 세고,
 *                        AI 가 독자 질문·공통점·빈틈(차별화 기회)·사실 후보([자료 n])·목차 4구간·제목 후보를 낸다
 *   ③ 차별화 준비·승인   «필요한 내 자료» 에 사람이 답하고, 목차·제목을 고쳐서 승인
 *   ④ 구간별 작성        4구간을 하나씩 쓰고(고치고 다시 쓰고) → [포스팅으로 저장] → 최종 검수로
 *
 * 도톨이 AI 의 «글 작성 준비·작업실» 흐름을 참고했다. 프롬프트·기준은 우리 말로 새로 썼다.
 * 상위 글 원문은 **저장하지 않는다** — 요청 안에서 숫자를 세고 AI 에 한 번 보여 준 뒤 버린다.
 * 남기는 것은 제목·주소·날짜·글자수·소제목 수뿐이다. 문장을 베끼지 말라고 지시문에 못 박는다.
 */
import { DateTime } from "luxon";
import { config } from "../config.js";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "../claude/parseResponse.js";
import { 블로그검색 } from "../naver/블로그검색.js";
import { 연관키워드 } from "../naver/검색광고.js";
import { 글주소읽기, 글본문가져오기 } from "../naver/내블로그.js";
import { 자주낱말 } from "../naver/낱말세기.js";
import { getCategory, type Category } from "../db/repositories/categories.js";
import { 작업넣기, 작업읽기, 작업적기, type 작업줄 } from "../db/repositories/workshops.js";
import { insertDraftPost, markReady, getPost, 변주적기 } from "../db/repositories/posts.js";
import { 보관줄찾기, 키워드썼음 } from "../db/repositories/keywordPool.js";
import { 개인설정들, resolvePostingDirectionInstruction, 최소분량 } from "../db/repositories/settings.js";
import { 글방식블록, 분량고르기 } from "../claude/글방식.js";
import { 승인스타일블록, 진단블록 } from "../claude/스타일분석.js";
import { 변주고르기, 변주블록, 최근모양보기, type 고른변주 } from "./변주.js";
import { assignDirectives } from "./directives.js";
import { 쓰는스타일 } from "./내스타일.js";
import { attachImage } from "./attachImage.js";

export const 구간수 = 4;
export const 준비한도ms = 180_000;
export const 구간한도ms = 150_000;

export interface 상위 { n: number; title: string; link: string; blogger: string; date: string; chars: number | null; heads: number | null; desc: string }
export interface 준비 {
  questions: string[]; common: string[]; gaps: string[];
  facts: { text: string; src: number | null }[];
  titles: string[]; outline: { heading: string; point: string }[]; need: string[]; tags: string[];
}
export interface 작업상태 {
  directions: string[];
  top: 상위[]; topWords: { word: string; count: number }[]; topAvg: number | null; topAt: string | null;
  prep: 준비 | null;
  answers: string[]; title: string; tags: string[]; outline: { heading: string; point: string }[];
  approvedAt: string | null;
  sections: string[];
  savedAt: string | null;
  styleVer: number | null;
  /** 이 글의 변주 — 첫 구간을 쓸 때 정하고 네 구간이 같이 쓴다 */
  variation?: 고른변주 | null;
}

export function 빈상태(directions: string[] = []): 작업상태 {
  return { directions, top: [], topWords: [], topAvg: null, topAt: null, prep: null, answers: [], title: "", tags: [],
    outline: [], approvedAt: null, sections: Array(구간수).fill(""), savedAt: null, styleVer: null };
}

export function 상태읽기(w: 작업줄): 작업상태 {
  let s: Partial<작업상태> = {};
  try { s = JSON.parse(w.state_json); } catch { s = {}; }
  const 바탕 = 빈상태();
  const 합 = { ...바탕, ...s } as 작업상태;
  합.sections = Array.from({ length: 구간수 }, (_, i) => String(합.sections?.[i] ?? ""));
  return 합;
}

/** 지금 몇 단계인가 — 화면이 이것으로 어디를 펼칠지 정한다. */
export function 단계(s: 작업상태, postId: number | null): 1 | 2 | 3 | 4 | 5 {
  if (postId) return 5;
  if (!s.prep) return 1;
  if (!s.approvedAt) return 2;
  return s.sections.every((x) => x.trim()) ? 4 : 3;
}

const 글 = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const 목록 = (v: unknown, n: number, 길이 = 200) => (Array.isArray(v) ? v : []).map((x) => 글(x, 길이)).filter(Boolean).slice(0, n);

export function 작업만들기(categoryId: number, keyword: string, directions: string[]): 작업줄 {
  const 말 = 글(keyword, 40);
  if (말.length < 2) throw new Error("키워드를 두 글자 이상 넣어 주세요.");
  return 작업넣기(categoryId, 말, 빈상태(목록(directions, 3, 40)));
}

/** 검색 방향 고르기용 — 연관어를 검색량 순으로. 실패하면 빈 목록. */
export async function 검색방향후보(keyword: string): Promise<{ keyword: string; vol: number }[]> {
  const 답 = await 연관키워드([keyword]);
  if (!답.ok) return [];
  const 붙 = keyword.replace(/\s+/g, "");
  return 답.rows.filter((r) => r.keyword !== 붙).map((r) => ({ keyword: r.keyword, vol: r.pc + r.mobile }))
    .sort((a, b) => b.vol - a.vol).slice(0, 15);
}

const 소제목같나 = (줄: string) => 줄.length >= 4 && 줄.length <= 35 && !/[.!?요다,]$/.test(줄);

function 스타일들(category: Category) {
  const 설정 = 개인설정들(["posting_direction_preset", "posting_direction_refinement"]);
  const 승인 = 쓰는스타일();
  return {
    방향: [resolvePostingDirectionInstruction(설정.posting_direction_preset), 설정.posting_direction_refinement].filter(Boolean).join("\n"),
    승인블록: 승인 ? [승인스타일블록(승인.분석.style), 진단블록(승인.분석)].filter(Boolean).join("\n") : "",
    승인ver: 승인?.ver ?? null,
    방식: 글방식블록(category),
  };
}

export function buildPrepPrompt(입력: { category: Category; keyword: string; directions: string[]; 상위들: (상위 & { body: string })[]; 낱말: string[]; 평균: number | null; 오늘: string }): string {
  const 글들 = 입력.상위들.map((p) => `── [자료 ${p.n}] ${p.title} (${p.date}, ${p.chars ?? "?"}자, 소제목 약 ${p.heads ?? "?"}개)\n${(p.body || p.desc).slice(0, 1800)}`).join("\n\n");
  return `
[글 준비 요청] 오늘 날짜: ${입력.오늘}. 네이버 블로그 한 편을 쓰기 전에, 같은 키워드의 상위 글을 보고 «준비 메모» 를 만든다.
키워드: ${입력.keyword}
다룰 검색 방향(사람이 고름): ${입력.directions.join(", ") || "(따로 없음 — 키워드 중심)"}
카테고리: ${입력.category.name} — ${입력.category.prompt_hint ?? ""}
상위 글 평균 ${입력.평균 ?? "?"}자 · 자주 나온 낱말: ${입력.낱말.join(", ") || "-"}

지킬 것
- 상위 글의 문장·구성을 베끼지 마라. 무엇을 다루는지만 파악하라.
- facts 는 상위 글에 나온 사실·숫자 «후보» 다. 어느 [자료 n] 에서 봤는지 src 에 번호를 적어라. 확인되지 않은 것이니 단정하지 마라.
- gaps 는 상위 글들이 놓쳤거나 얕게 다룬 것 — 이 글의 차별화 기회다.
- need 는 블로그 주인에게 물어볼 «내 자료» 질문이다(직접 겪은 일·사진·가격·지역 등). 답을 받아 1인칭으로 쓸 수 있게.
- outline 은 정확히 ${구간수}구간. heading 은 이모지로 시작하는 짧은 소제목, point 는 그 구간에서 할 말 한 줄.

[답 형식 — 다른 말 없이 JSON 하나]
{"questions": ["독자가 궁금해할 질문 5개"], "common": ["상위 글이 공통으로 다루는 것 5개"], "gaps": ["차별화 기회 4개"],
 "facts": [{"text": "사실·숫자 후보", "src": 1}], "titles": ["제목 후보 3개 — 키워드를 앞쪽에"],
 "outline": [{"heading": "📌 소제목", "point": "할 말"}], "need": ["내 자료 질문 3개"], "tags": ["태그 5개(# 없이)"]}

[상위 글]
${글들 || "(상위 글을 받지 못했다 — 키워드만 보고 일반적인 준비 메모를 만들어라)"}
`.trim();
}

export function 준비다듬기(날: any): 준비 {
  const outline = (Array.isArray(날?.outline) ? 날.outline : []).map((x: any) => ({ heading: 글(x?.heading, 60), point: 글(x?.point, 200) }))
    .filter((x: { heading: string }) => x.heading).slice(0, 구간수);
  while (outline.length < 구간수) outline.push({ heading: `📌 ${outline.length + 1}구간`, point: "" });
  return {
    questions: 목록(날?.questions, 6), common: 목록(날?.common, 6), gaps: 목록(날?.gaps, 5),
    facts: (Array.isArray(날?.facts) ? 날.facts : []).map((x: any) => ({ text: 글(x?.text, 200), src: Number.isFinite(Number(x?.src)) && x?.src !== null ? Number(x.src) : null }))
      .filter((x: { text: string }) => x.text).slice(0, 10),
    titles: 목록(날?.titles, 3, 80), outline, need: 목록(날?.need, 4), tags: 목록(날?.tags, 8, 20).map((t) => t.replace(/^#/, "")),
  };
}

/** ② 상위 5개 확보 + 사전 지식. 오래 걸린다(본문 5편 ≤ 25초 + AI ≤ 3분). */
export async function 준비하기(id: number): Promise<작업상태> {
  const w = 작업읽기(id);
  if (!w) throw new Error("작업을 찾을 수 없습니다.");
  const category = getCategory(w.category_id);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다.");
  const s = 상태읽기(w);

  const 검색 = await 블로그검색([w.keyword, ...s.directions.slice(0, 1)].join(" ").trim(), 15);
  const 후보 = 검색.ok ? 검색.items.filter((x) => x.link && 글주소읽기(x.link)).slice(0, 5) : [];
  const 상위들 = await Promise.all(후보.map(async (x, i) => {
    const 곳 = 글주소읽기(x.link!)!;
    const body = await 글본문가져오기(곳.blogId, 곳.logNo).catch(() => "");
    const 줄들 = body.split("\n").map((l) => l.trim()).filter(Boolean);
    return { n: i + 1, title: x.title, link: x.link!, blogger: x.blogger ?? 곳.blogId, date: x.date, desc: x.desc,
      chars: body ? body.replace(/\s/g, "").length : null, heads: body ? 줄들.filter(소제목같나).length : null, body };
  }));
  const 길이들 = 상위들.map((p) => p.chars).filter((c): c is number => !!c);
  const 평균 = 길이들.length ? Math.round(길이들.reduce((a, b) => a + b, 0) / 길이들.length) : null;
  const 낱말 = 자주낱말(상위들.map((p) => `${p.title}\n${p.body || p.desc}`), 15, [w.keyword]);

  const 오늘 = DateTime.now().setZone(config.timezone).toFormat("yyyy-MM-dd");
  const 답 = await runAI({ prompt: buildPrepPrompt({ category, keyword: w.keyword, directions: s.directions, 상위들, 낱말: 낱말.map((x) => x.word), 평균, 오늘 }), timeoutMs: 준비한도ms });
  const 날 = parseJsonLoose(답);
  if (!날 || typeof 날 !== "object") throw new Error("AI 답을 읽지 못했습니다. 다시 눌러 주세요.");
  const prep = 준비다듬기(날);

  const 새 = {
    ...s,
    top: 상위들.map(({ body: _b, ...p }) => ({ ...p, desc: p.desc.slice(0, 160) })),   // 원문(body)은 버린다
    topWords: 낱말, topAvg: 평균, topAt: new Date().toISOString(), prep,
    // 사람이 고칠 칸은 AI 안으로 채워 두되, 이미 승인했으면 건드리지 않는다
    ...(s.approvedAt ? {} : { title: prep.titles[0] ?? w.keyword, tags: prep.tags, outline: prep.outline, answers: prep.need.map(() => "") }),
  };
  작업적기(id, 새);
  return 새;
}

/** ③ 승인 — 사람이 고친 목차·제목·태그·내 자료 답. */
export function 승인하기(id: number, 값: { title?: string; tags?: string[]; outline?: { heading: string; point: string }[]; answers?: string[] }): 작업상태 {
  const w = 작업읽기(id);
  if (!w) throw new Error("작업을 찾을 수 없습니다.");
  const s = 상태읽기(w);
  if (!s.prep) throw new Error("먼저 ② 상위 글 확보·사전 지식을 해 주세요.");
  const outline = (값.outline ?? s.outline).map((x) => ({ heading: 글(x?.heading, 60), point: 글(x?.point, 200) })).slice(0, 구간수);
  if (outline.length < 구간수 || outline.some((x) => !x.heading)) throw new Error(`목차 ${구간수}구간의 소제목을 모두 채워 주세요.`);
  const title = 글(값.title ?? s.title, 80);
  if (title.length < 5) throw new Error("제목을 다섯 글자 이상 넣어 주세요.");
  const 새 = { ...s, outline, title, tags: 목록(값.tags ?? s.tags, 8, 20).map((t) => t.replace(/^#/, "")),
    answers: (값.answers ?? s.answers).map((x) => 글(x, 800)), approvedAt: new Date().toISOString() };
  작업적기(id, 새);
  return 새;
}

export function buildSectionPrompt(입력: { category: Category; keyword: string; s: 작업상태; n: number; 목표: number; 스타일: ReturnType<typeof 스타일들>; 변주?: string }): string {
  const { s, n } = 입력;
  const 이곳 = s.outline[n];
  const 앞 = s.sections.slice(0, n).join("\n\n").slice(-1500);
  const 내자료 = (s.prep?.need ?? []).map((q, i) => (s.answers[i]?.trim() ? `- ${q}\n  → ${s.answers[i].trim()}` : "")).filter(Boolean).join("\n");
  const 사실 = (s.prep?.facts ?? []).map((f) => `- ${f.text}${f.src ? ` [자료 ${f.src}]` : ""}`).join("\n");
  return `
[구간 작성 요청] 네이버 블로그 글 «${s.title}» 의 ${n + 1}/${구간수} 구간만 써라. 키워드: ${입력.keyword}. 카테고리: ${입력.category.name}.

[전체 목차]
${s.outline.map((o, i) => `${i + 1}. ${o.heading} — ${o.point}${i === n ? "   ← 지금 쓸 구간" : ""}`).join("\n")}

[이 구간] ${이곳.heading}
할 말: ${이곳.point || "(목차에 맞게)"}
분량: ${입력.목표}자 안팎(공백 포함)

${입력.스타일.방향 ? `[포스팅 방향]\n${입력.스타일.방향}\n` : ""}${입력.스타일.승인블록 ? `${입력.스타일.승인블록}\n` : ""}${입력.스타일.방식}
${입력.변주 ? `\n${입력.변주}` : ""}

[사실 후보 — 상위 글에 나온 것, 확인 전]
${사실 || "(없음)"}
- 이 사실을 쓸 때는 그 문장 끝에 [자료 n] 을 붙여라(사람이 확인할 수 있게). 숫자를 지어내지 마라.

[블로그 주인의 내 자료 — 이것만 1인칭 경험으로 쓸 수 있다]
${내자료 || "(없음 — 겪은 일처럼 쓰지 마라)"}

[앞 구간까지 쓴 것 — 되풀이하지 마라]
${앞 || "(첫 구간)"}

[지킬 것]
- 첫 줄은 위 소제목을 그대로. 마크다운 기호(#, *, ■, ▶) 금지. 목록은 이모지로 시작.
- 상위 글 문장을 베끼지 마라. 수익·효과를 약속하는 말(무조건, 100%, 보장) 금지.
- ${n === 0 ? "첫 구간: 독자가 가장 궁금한 답을 먼저 짧게." : n === 구간수 - 1 ? "마지막 구간: 핵심을 정리하고 다음에 할 일을 안내. 앞 내용 되풀이 금지." : "앞 구간과 자연스럽게 이어지게."}

[답 형식 — 다른 말 없이 JSON 하나] {"text": "이 구간 본문(소제목 줄 포함)"}
`.trim();
}

/** ④ 한 구간 쓰기. 앞 구간이 비어 있어도 쓸 수 있다(사람이 순서를 정한다). */
export async function 구간쓰기(id: number, n: number): Promise<작업상태> {
  const w = 작업읽기(id);
  if (!w) throw new Error("작업을 찾을 수 없습니다.");
  const category = getCategory(w.category_id);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다.");
  const s = 상태읽기(w);
  if (!s.approvedAt) throw new Error("먼저 ③ 차별화 준비를 승인해 주세요.");
  if (!(n >= 0 && n < 구간수)) throw new Error("구간 번호가 틀렸습니다.");
  const 분량 = 분량고르기(category.length_pref);
  const 목표 = Math.round((분량.목표 ?? 최소분량()) / 구간수);
  const 스타일 = 스타일들(category);
  // 변주는 한 번 정해 네 구간이 같이 쓴다(구간마다 바뀌면 한 글 안에서 들쭉날쭉해진다).
  let 변주글 = "";
  try {
    const 모양 = 최근모양보기();
    if (!s.variation) {
      s.variation = 변주고르기(assignDirectives(1)[0], 모양).변주;
      const 지금것 = 상태읽기(작업읽기(id)!);
      작업적기(id, { ...지금것, variation: s.variation });
    }
    변주글 = 변주블록(s.variation, 모양, { 구간: { n, 수: 구간수 } });
  } catch { 변주글 = ""; }
  const 답 = await runAI({ prompt: buildSectionPrompt({ category, keyword: w.keyword, s, n, 목표, 스타일, 변주: 변주글 }), timeoutMs: 구간한도ms });
  const 날 = parseJsonLoose(답) as { text?: unknown } | null;
  const text = 글(날 && typeof 날 === "object" && 날.text ? 날.text : 답, 6000).replace(/^[#*■▶]+\s*/gm, "");
  if (text.length < 30) throw new Error("AI 가 쓴 글이 너무 짧습니다. 다시 눌러 주세요.");
  // 최신 상태에 이 구간만 바꿔 넣는다(그사이 사람이 다른 구간을 고쳤을 수 있다).
  const 지금 = 상태읽기(작업읽기(id)!);
  지금.sections[n] = text;
  지금.styleVer = 스타일.승인ver;
  작업적기(id, 지금);
  return 지금;
}

/** 사람이 고친 구간·제목 저장. */
export function 구간저장(id: number, 값: { sections?: string[]; title?: string }): 작업상태 {
  const w = 작업읽기(id);
  if (!w) throw new Error("작업을 찾을 수 없습니다.");
  const s = 상태읽기(w);
  if (Array.isArray(값.sections)) s.sections = Array.from({ length: 구간수 }, (_, i) => 글(값.sections![i] ?? s.sections[i], 6000));
  if (값.title !== undefined && 글(값.title, 80).length >= 5) s.title = 글(값.title, 80);
  작업적기(id, s);
  return s;
}

export const 자료표시 = /\s?\[자료\s*\d+\]/g;

/** ⑤ 포스팅으로 저장 → 포스팅 탭에 카드가 생기고 [🔎 최종 검수] 로 이어 간다. */
export async function 포스팅저장(id: number, 옵션: { 자료표시지우기?: boolean } = {}): Promise<{ postId: number; imageError: string | null }> {
  const w = 작업읽기(id);
  if (!w) throw new Error("작업을 찾을 수 없습니다.");
  if (w.post_id && getPost(w.post_id)) throw new Error("이미 포스팅으로 저장했습니다. 포스팅 탭에서 보세요.");
  const s = 상태읽기(w);
  if (!s.sections.every((x) => x.trim())) throw new Error(`${구간수}구간을 모두 쓴 뒤 저장할 수 있습니다.`);
  let 본문 = s.sections.map((x) => x.trim()).join("\n\n");
  if (옵션.자료표시지우기 !== false) 본문 = 본문.replace(자료표시, "");
  const post = insertDraftPost({ categoryId: w.category_id, title: s.title, content: 본문, imageQuery: w.keyword, tags: s.tags.map((t) => `#${t.replace(/^#/, "").replace(/\s+/g, "")}`) });
  if (s.variation) { try { 변주적기(post.id, s.variation); } catch { /* 기록 못 해도 글은 그대로 */ } }
  let imageError: string | null = null;
  try { await attachImage(post); } catch (err) { imageError = (err as Error).message; }
  markReady(post.id);
  const 보관 = 보관줄찾기(w.category_id, w.keyword);
  if (보관 && 보관.status === "candidate") 키워드썼음(보관.id);
  작업적기(id, { ...s, savedAt: new Date().toISOString() }, post.id);
  return { postId: post.id, imageError };
}
