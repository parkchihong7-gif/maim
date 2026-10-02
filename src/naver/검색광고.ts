/**
 * **네이버 검색광고 API — 키워드 도구.** 연관 키워드·월간 검색량·경쟁 정도.
 *
 *     GET https://api.searchad.naver.com/keywordstool?hintKeywords=…&showDetail=1
 *     헤더 X-Timestamp · X-API-KEY · X-Customer · X-Signature
 *     서명 = base64( HMAC-SHA256( 비밀키, "{timestamp}.{METHOD}.{uri}" ) )
 *
 * 광고를 만들거나 돈이 나가는 호출은 하지 않는다. 숫자만 읽는다.
 * 실패해도 예외를 던지지 않고 `{ ok:false, why }` 를 돌려준다.
 */
import crypto from "node:crypto";
import { 가짜모드, 가짜자료, 네이버키들, 네이버한도ms, 코드사유, type 네이버실패 } from "./키.js";

export interface 연관어 {
  keyword: string;
  pc: number;
  mobile: number;
  /** 경쟁 정도: 낮음 / 중간 / 높음 */
  comp: string;
}
export type 키워드도구결과 = { ok: true; rows: 연관어[] } | 네이버실패;

const 바탕 = "https://api.searchad.naver.com";
const 경로 = "/keywordstool";

/** 서명 문자열과 HMAC. 시험에서 직접 확인한다. */
export function 서명(timestamp: string, method: string, uri: string, 비밀키: string): string {
  return crypto.createHmac("sha256", 비밀키).update(`${timestamp}.${method}.${uri}`).digest("base64");
}

/** "< 10" 처럼 오는 검색량을 숫자로. 10 미만은 5 로 본다. */
export function 검색량숫자(값: unknown): number {
  if (typeof 값 === "number") return Number.isFinite(값) ? 값 : 0;
  const 글 = String(값 ?? "").trim();
  if (글.startsWith("<")) return 5;
  const n = Number(글.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 씨앗은 한 번에 5개까지, 띄어쓰기는 뺀다(검색광고 API 규칙). */
export function 씨앗다듬기(seeds: string[]): string[] {
  const 본 = new Set<string>();
  for (const s of seeds) {
    const 말 = String(s ?? "").replace(/\s+/g, "").trim();
    if (말) 본.add(말);
    if (본.size >= 5) break;
  }
  return [...본];
}

function 다듬기(답: any): 키워드도구결과 {
  const 목록 = Array.isArray(답?.keywordList) ? 답.keywordList : [];
  return {
    ok: true,
    rows: 목록.map((x: any) => ({
      keyword: String(x?.relKeyword ?? "").trim(),
      pc: 검색량숫자(x?.monthlyPcQcCnt),
      mobile: 검색량숫자(x?.monthlyMobileQcCnt),
      comp: String(x?.compIdx ?? "").trim(),
    })).filter((r: 연관어) => r.keyword),
  };
}

export async function 연관키워드(seeds: string[]): Promise<키워드도구결과> {
  const 씨앗 = 씨앗다듬기(seeds);
  if (씨앗.length === 0) return { ok: false, why: "씨앗 키워드가 비어 있습니다." };

  if (가짜모드()) {
    const 자료 = 가짜자료();
    if (자료?.ad?.fail) return { ok: false, why: String(자료.ad.fail) };
    return 다듬기(자료?.ad ?? {});
  }

  const 키 = 네이버키들();
  if (!키.adKey || !키.adSecret || !키.adCustomer) {
    return { ok: false, why: "검색광고 API 키(엑세스라이선스·비밀키·CUSTOMER_ID)가 아직 다 들어 있지 않습니다." };
  }

  const timestamp = String(Date.now());
  // 씨앗은 «하나씩» 인코딩하고 쉼표는 그대로 둔다. 통째로 인코딩하면 쉼표가 %2C 가 되어
  // 네이버가 한 덩어리 키워드로 읽고 400(잘못된 파라미터)을 준다 — 씨앗 1개인 연결 테스트는
  // 통과하고 씨앗이 여럿인 [지금 모으기] 만 3초 만에 끝나던 까닭.
  const url = `${바탕}${경로}?hintKeywords=${씨앗.map(encodeURIComponent).join(",")}&showDetail=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "X-Timestamp": timestamp,
        "X-API-KEY": 키.adKey,
        "X-Customer": 키.adCustomer,
        "X-Signature": 서명(timestamp, "GET", 경로, 키.adSecret),
      },
      signal: AbortSignal.timeout(네이버한도ms),
    });
    const 본문 = await res.text();
    if (!res.ok) {
      // 씨앗 여럿을 한 번에 못 받아 주면(400) 하나씩 따로 묻고 합친다.
      // 씨앗 하나가 이상한 글자라 통째로 막히는 일도 이것으로 피한다.
      if (res.status === 400 && 씨앗.length > 1) return 하나씩물어합치기(씨앗, 코드사유(res.status, 본문));
      return { ok: false, status: res.status, why: 코드사유(res.status, 본문) };
    }
    return 다듬기(JSON.parse(본문));
  } catch (err) {
    const e = err as Error;
    if (e.name === "TimeoutError" || e.name === "AbortError") return { ok: false, why: "네이버가 10초 안에 답하지 않았습니다." };
    return { ok: false, why: `네이버에 닿지 못했습니다 — ${e.message}` };
  }
}

async function 하나씩물어합치기(씨앗: string[], 처음까닭: string): Promise<키워드도구결과> {
  const 본 = new Map<string, 연관어>();
  const 까닭들: string[] = [];
  for (const 하나 of 씨앗) {
    const 답 = await 연관키워드([하나]);
    if (!답.ok) { 까닭들.push(`«${하나}»: ${답.why}`); continue; }
    for (const 줄 of 답.rows) if (!본.has(줄.keyword)) 본.set(줄.keyword, 줄);
  }
  if (!본.size) return { ok: false, why: `연관 키워드를 받지 못했습니다 — ${까닭들[0] ?? 처음까닭}` };
  return { ok: true, rows: [...본.values()] };
}
