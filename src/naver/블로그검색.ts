/**
 * **네이버 블로그 검색 API** — 이미 쓰인 글 수(`total`)와 상위 글.
 *
 * 창구가 둘이다. 키(Client ID·Secret) 두 칸은 같고, 어느 창구의 키인지에 따라
 * 주소와 헤더 이름만 다르다. **새 창구(API HUB)를 먼저** 부르고, 키가 안 맞으면
 * (401·403) 옛 창구로 한 번 더 부른다. 맞은 쪽을 기억해 다음부터는 바로 간다.
 *
 *   새 창구  NAVER API HUB (네이버 클라우드 플랫폼, 종량제)
 *     GET https://naverapihub.apigw.ntruss.com/search/v1/blog?query=…&display=10&sort=sim
 *     헤더 X-NCP-APIGW-API-KEY-ID · X-NCP-APIGW-API-KEY
 *   옛 창구  네이버 개발자센터 (2026-07-31 신규 발급 끝, 2027-06-30 까지 호출)
 *     GET https://openapi.naver.com/v1/search/blog.json?…
 *     헤더 X-Naver-Client-Id · X-Naver-Client-Secret
 *
 * 질의·응답 모양은 둘이 같다. 실패해도 예외를 던지지 않고 `{ ok:false, why }` 를
 * 돌려준다 — 네이버가 잠깐 안 돼도 글쓰기는 멈추면 안 된다.
 */
import { 가짜모드, 가짜자료, 네이버키들, 네이버한도ms, 코드사유, type 네이버실패 } from "./키.js";

export interface 상위글 { title: string; desc: string; date: string }
export type 블로그검색결과 = { ok: true; total: number; items: 상위글[] } | 네이버실패;

export const 창구들 = {
  hub: { 이름: "API HUB", 주소: "https://naverapihub.apigw.ntruss.com/search/v1/blog",
         헤더: (id: string, secret: string) => ({ "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": secret }) },
  legacy: { 이름: "개발자센터", 주소: "https://openapi.naver.com/v1/search/blog.json",
            헤더: (id: string, secret: string) => ({ "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret }) },
} as const;
type 창구 = keyof typeof 창구들;

/** 지난번에 맞았던 창구. 키를 바꾸면 다시 HUB 부터 본다. */
let 맞은창구: { 키: string; 창구: 창구 } | null = null;
export function 맞은창구보기(): 창구 | null { return 맞은창구 ? 맞은창구.창구 : null; }
export function 창구기억지우기(): void { 맞은창구 = null; }

/** 검색 결과의 <b> 같은 태그와 &quot; 같은 글자를 걷어 낸다. */
export function 태그빼기(글: string): string {
  return (글 ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .trim();
}

function 다듬기(답: any): 블로그검색결과 {
  const items = Array.isArray(답?.items) ? 답.items : [];
  return {
    ok: true,
    total: Number(답?.total) || 0,
    items: items.slice(0, 10).map((x: any) => ({
      title: 태그빼기(String(x?.title ?? "")),
      desc: 태그빼기(String(x?.description ?? "")),
      date: String(x?.postdate ?? ""),
    })),
  };
}

export async function 블로그검색(query: string, display = 10): Promise<블로그검색결과> {
  const 말 = (query ?? "").trim();
  if (!말) return { ok: false, why: "검색할 말이 비어 있습니다." };

  if (가짜모드()) {
    const 자료 = 가짜자료();
    if (자료?.blog?.fail) return { ok: false, why: String(자료.blog.fail) };
    const 따로 = 자료?.blogTotals ?? {};
    if (말 in 따로) {
      if (따로[말] === null) return { ok: false, why: "가짜 모드: 이 키워드는 문서 수를 못 받은 것으로 흉내 냅니다." };
      return 다듬기({ ...자료.blog, total: 따로[말] });
    }
    return 다듬기(자료?.blog ?? {});
  }

  const 키 = 네이버키들();
  if (!키.searchId || !키.searchSecret) return { ok: false, why: "블로그 검색 API 키(Client ID·Secret)가 아직 없습니다." };

  const 질의 = `?query=${encodeURIComponent(말)}&display=${Math.min(Math.max(display, 1), 100)}&sort=sim`;
  const 키지문 = `${키.searchId}:${키.searchSecret.length}`;
  const 차례: 창구[] = 맞은창구 && 맞은창구.키 === 키지문
    ? [맞은창구.창구] : ["hub", "legacy"];

  let 마지막: 네이버실패 = { ok: false, why: "네이버에 닿지 못했습니다." };
  for (const 쪽 of 차례) {
    const 창 = 창구들[쪽];
    try {
      const res = await fetch(창.주소 + 질의, {
        headers: 창.헤더(키.searchId, 키.searchSecret),
        signal: AbortSignal.timeout(네이버한도ms),
      });
      const 본문 = await res.text();
      if (res.ok) {
        맞은창구 = { 키: 키지문, 창구: 쪽 };
        return 다듬기(JSON.parse(본문));
      }
      마지막 = { ok: false, status: res.status, why: 코드사유(res.status, 본문) };
      // 키가 이 창구 것이 아니면 다른 창구로. 그 밖의 탈(429·500)은 거기서 멈춘다.
      if (res.status !== 401 && res.status !== 403) return 마지막;
    } catch (err) {
      const e = err as Error;
      if (e.name === "TimeoutError" || e.name === "AbortError") return { ok: false, why: "네이버가 10초 안에 답하지 않았습니다." };
      마지막 = { ok: false, why: `네이버에 닿지 못했습니다 — ${e.message}` };
    }
  }
  // 키를 기억해 둔 창구가 이번에 안 맞으면 다음에는 둘 다 다시 본다.
  맞은창구 = null;
  if (마지막.status === 401 || 마지막.status === 403) {
    마지막.why = `키를 다시 확인하세요 (${마지막.status}). NAVER API HUB 의 [인증 정보] 에 있는 Client ID·Client Secret 을 넣으셨는지, `
             + "API HUB 앱에서 «블로그 검색» 을 골랐는지 보아 주세요.";
  }
  return 마지막;
}
