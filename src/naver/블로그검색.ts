/**
 * **네이버 블로그 검색 API** — 이미 쓰인 글 수(`total`)와 상위 글.
 *
 *     GET https://openapi.naver.com/v1/search/blog.json?query=…&display=10&sort=sim
 *     헤더 X-Naver-Client-Id · X-Naver-Client-Secret
 *
 * 무료, 하루 25,000회. 실패해도 예외를 던지지 않고 `{ ok:false, why }` 를 돌려준다
 * — 네이버가 잠깐 안 돼도 글쓰기는 멈추면 안 된다.
 */
import { 가짜모드, 가짜자료, 네이버키들, 네이버한도ms, 코드사유, type 네이버실패 } from "./키.js";

export interface 상위글 { title: string; desc: string; date: string }
export type 블로그검색결과 = { ok: true; total: number; items: 상위글[] } | 네이버실패;

const 주소 = "https://openapi.naver.com/v1/search/blog.json";

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

  const url = `${주소}?query=${encodeURIComponent(말)}&display=${Math.min(Math.max(display, 1), 100)}&sort=sim`;
  try {
    const res = await fetch(url, {
      headers: { "X-Naver-Client-Id": 키.searchId, "X-Naver-Client-Secret": 키.searchSecret },
      signal: AbortSignal.timeout(네이버한도ms),
    });
    const 본문 = await res.text();
    if (!res.ok) return { ok: false, status: res.status, why: 코드사유(res.status, 본문) };
    return 다듬기(JSON.parse(본문));
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") return { ok: false, why: "네이버가 10초 안에 답하지 않았습니다." };
    return { ok: false, why: `네이버에 닿지 못했습니다 — ${e.message}` };
  }
}
