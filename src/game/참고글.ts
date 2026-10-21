/**
 * 📚 공략 글 참고 글 — 인벤·공식·커뮤니티 주소 (GAME_PLAN 15-7).
 *
 * 참고 글은 **사실 확인·빠진 정보 보충용**이다. 문장·표·사진은 베끼지 않는다.
 * 로그인이 필요한 곳(네이버 카페 회원 글 등)과 유튜브 본문은 열지 않고 «못 읽음».
 * 읽은 것은 퀘스트마다 메모(ref_brief)로 남겨 7일 동안 같은 주소를 다시 열지 않는다.
 */
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "../claude/parseResponse.js";

export const 참고종류 = ["인벤", "공식", "커뮤니티", "유튜브", "기타"] as const;
export interface 참고주소 { url: string; kind: string; title?: string; state?: "안읽음" | "읽음" | "못읽음"; why?: string }

export const 메모유효일 = 7;
export const 주소최대 = 4;

/** 열면 안 되는(로그인 필요·영상) 주소. */
export function 못여는주소(url: string): string | null {
  if (/youtube\.com|youtu\.be/i.test(url)) return "유튜브 본문은 읽지 않습니다";
  if (/cafe\.naver\.com|instagram\.com|facebook\.com|tiktok\.com|discord\.(gg|com)/i.test(url)) return "로그인이 필요한 곳이라 열지 않습니다";
  return null;
}

export function 종류짐작(url: string): string {
  if (/inven\.co\.kr/i.test(url)) return "인벤";
  if (/youtube\.com|youtu\.be/i.test(url)) return "유튜브";
  if (/dcinside|arca\.live|cafe\.naver|ruliweb|fmkorea/i.test(url)) return "커뮤니티";
  return "기타";
}

export function 주소다듬기(목록: unknown): 참고주소[] {
  if (!Array.isArray(목록)) return [];
  return 목록.flatMap((r) => {
    const o = r as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    if (!/^https?:\/\/\S+$/.test(url)) return [];
    const kind = (참고종류 as readonly string[]).includes(String(o.kind)) ? String(o.kind) : 종류짐작(url);
    const 막힘 = 못여는주소(url);
    return [{ url: url.slice(0, 400), kind, title: String(o.title ?? "").slice(0, 80) || undefined,
      state: 막힘 ? "못읽음" as const : (o.state === "읽음" ? "읽음" as const : "안읽음" as const), why: 막힘 ?? undefined }];
  }).slice(0, 10);
}

/** 주소들을 읽어 메모 한 덩이로. 열 수 있는 것만, 최대 4개, 120초. */
export async function 참고글읽기(게임: string, 퀘스트: string, 주소들: 참고주소[]): Promise<{ 메모: string; 주소들: 참고주소[] }> {
  const 열것 = 주소들.filter((a) => !못여는주소(a.url)).slice(0, 주소최대);
  if (!열것.length) return { 메모: "", 주소들 };
  const prompt = `
[참고 글 읽기]
게임 «${게임}» 의 퀘스트 «${퀘스트}» 공략을 쓰려 한다. 아래 주소를 열어(WebFetch) 사실만 짧게 메모하라.
${열것.map((a, i) => `${i + 1}. (${a.kind}) ${a.url}`).join("\n")}
- 퀘스트 받는 곳·이동 경로·목표·보스·보상·요구 레벨 같은 **사실**만. 문장을 베끼지 말고 네 말로 짧게.
- 수치는 어느 주소에서 봤는지 [1] 처럼 번호를 붙여라.
- 열리지 않거나 로그인이 필요하면 그 번호를 못읽음에 넣어라.
최종 답변은 순수 JSON 하나로만: {"메모":"…(600자 이내)","읽음":[1],"못읽음":[2],"제목":{"1":"글 제목"}}
`.trim();
  const 원문 = await runAI({ prompt, needsSearch: true, timeoutMs: 120_000 });
  const 값 = (parseJsonLoose(원문) ?? {}) as { 메모?: string; 읽음?: number[]; 못읽음?: number[]; 제목?: Record<string, string> };
  const 읽음 = new Set((값.읽음 ?? []).map(Number));
  const 못 = new Set((값.못읽음 ?? []).map(Number));
  const 새주소 = 주소들.map((a) => {
    const i = 열것.indexOf(a) + 1;
    if (!i) return a;
    return { ...a, title: a.title || 값.제목?.[String(i)] || undefined, state: 읽음.has(i) ? "읽음" as const : 못.has(i) ? "못읽음" as const : a.state };
  });
  return { 메모: String(값.메모 ?? "").slice(0, 1500), 주소들: 새주소 };
}

/** 🔎 찾아 넣기 — 게임명 + 퀘스트명 + 공략, 후보 최대 5개(인벤 먼저). */
export async function 참고글찾기(게임: string, 퀘스트: string, 기본주소: string[] = []): Promise<참고주소[]> {
  const prompt = `
[참고 글 찾기]
웹 검색으로 «${게임} ${퀘스트} 공략» 글을 찾아라. 검색은 최대 2번.
${기본주소.length ? `이 게시판을 먼저 본다: ${기본주소.join(", ")}\n` : ""}- 인벤 → 공식 홈페이지/공지 → 커뮤니티 순서로, 최대 5개. 찾은 것만, 지어내지 마라.
최종 답변은 순수 JSON 하나로만: {"후보":[{"url":"https://…","kind":"인벤|공식|커뮤니티|유튜브|기타","title":"글 제목"}]}
`.trim();
  const 원문 = await runAI({ prompt, needsSearch: true, searchOnly: true, timeoutMs: 90_000 });
  const 값 = (parseJsonLoose(원문) ?? {}) as { 후보?: unknown[] };
  const 순서 = { 인벤: 0, 공식: 1, 커뮤니티: 2, 기타: 3, 유튜브: 4 } as Record<string, number>;
  return 주소다듬기(값.후보).sort((a, b) => (순서[a.kind] ?? 3) - (순서[b.kind] ?? 3)).slice(0, 5);
}
