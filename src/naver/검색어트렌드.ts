/**
 * **네이버 데이터랩 검색어트렌드** — 키워드의 최근 12개월 검색 흐름(상대값 0~100).
 *
 *   새 창구  POST https://naverapihub.apigw.ntruss.com/datalab/v1/search   (API HUB — 경로는 배포 후 확인 필요)
 *   옛 창구  POST https://openapi.naver.com/v1/datalab/search
 *   본문     {startDate, endDate, timeUnit:"month", keywordGroups:[{groupName, keywords:[…]}] (5개까지)}
 *
 * 키는 블로그 검색과 같은 Client ID·Secret 이다(API HUB 앱에서 «검색어트렌드» 도 골라 두어야 한다).
 * 값은 «한 번에 물은 묶음 안에서» 가장 큰 달을 100 으로 한 상대값이라, 키워드끼리 크기 비교에는 쓰지 않고
 * **자기 흐름(오름·내림)** 만 본다. 실패해도 예외 대신 `{ ok:false, why }`.
 */
import { DateTime } from "luxon";
import { 가짜모드, 가짜자료, 네이버키들, 네이버한도ms, 코드사유, type 네이버실패 } from "./키.js";

export type 흐름 = "up" | "flat" | "down";
export interface 트렌드 { keyword: string; months: { m: string; v: number }[]; dir: 흐름; change: number }
export type 트렌드결과 = { ok: true; rows: 트렌드[] } | 네이버실패;

const 창구 = [
  { 주소: "https://naverapihub.apigw.ntruss.com/datalab/v1/search",
    헤더: (id: string, s: string) => ({ "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": s }) },
  { 주소: "https://openapi.naver.com/v1/datalab/search",
    헤더: (id: string, s: string) => ({ "X-Naver-Client-Id": id, "X-Naver-Client-Secret": s }) },
];

/** 최근 3달 평균 ÷ 그 앞 3달 평균. +15% 넘으면 오름, −15% 밑이면 내림. */
export function 흐름보기(값들: number[]): { dir: 흐름; change: number } {
  const 뒤 = 값들.slice(-3), 앞 = 값들.slice(-6, -3);
  const 평 = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  if (!앞.length || 평(앞) === 0) return { dir: 평(뒤) > 0 ? "up" : "flat", change: 0 };
  const change = Math.round(((평(뒤) - 평(앞)) / 평(앞)) * 100);
  return { dir: change >= 15 ? "up" : change <= -15 ? "down" : "flat", change };
}

function 다듬기(답: any): 트렌드[] {
  return (Array.isArray(답?.results) ? 답.results : []).map((r: any) => {
    const months = (Array.isArray(r?.data) ? r.data : []).map((d: any) => ({ m: String(d?.period ?? "").slice(0, 7), v: Number(d?.ratio) || 0 }));
    return { keyword: String(r?.title ?? ""), months, ...흐름보기(months.map((x: { v: number }) => x.v)) };
  }).filter((r: 트렌드) => r.keyword);
}

/** 키워드 5개까지 한 번에. 더 많으면 부르는 쪽이 나눈다. */
export async function 검색어트렌드(keywords: string[]): Promise<트렌드결과> {
  const 말들 = [...new Set(keywords.map((k) => String(k ?? "").trim()).filter(Boolean))].slice(0, 5);
  if (!말들.length) return { ok: false, why: "키워드가 비어 있습니다." };

  if (가짜모드()) {
    const 자료 = 가짜자료()?.trend ?? {};
    if (자료.fail) return { ok: false, why: String(자료.fail) };
    return { ok: true, rows: 말들.map((k, i) => {
      const 값들: number[] = 자료[k] ?? Array.from({ length: 12 }, (_, j) => 40 + ((i % 3) - 1) * j * 4);
      const months = 값들.map((v, j) => ({ m: DateTime.now().minus({ months: 11 - j }).toFormat("yyyy-MM"), v }));
      return { keyword: k, months, ...흐름보기(값들) };
    }) };
  }

  const 키 = 네이버키들();
  if (!키.searchId || !키.searchSecret) return { ok: false, why: "블로그 검색 API 키(Client ID·Secret)가 아직 없습니다." };
  const 끝 = DateTime.now().minus({ months: 1 }).endOf("month");
  const 본문 = JSON.stringify({
    startDate: 끝.minus({ months: 11 }).startOf("month").toFormat("yyyy-MM-dd"),
    endDate: 끝.toFormat("yyyy-MM-dd"),
    timeUnit: "month",
    keywordGroups: 말들.map((k) => ({ groupName: k, keywords: [k] })),
  });
  let 마지막: 네이버실패 = { ok: false, why: "네이버에 닿지 못했습니다." };
  for (const 창 of 창구) {
    try {
      const res = await fetch(창.주소, {
        method: "POST",
        headers: { ...창.헤더(키.searchId, 키.searchSecret), "Content-Type": "application/json" },
        body: 본문,
        signal: AbortSignal.timeout(네이버한도ms),
      });
      const 글 = await res.text();
      if (res.ok) return { ok: true, rows: 다듬기(JSON.parse(글)) };
      마지막 = { ok: false, status: res.status, why: 코드사유(res.status, 글) };
      if (![401, 403, 404].includes(res.status)) return 마지막;
    } catch (err) {
      마지막 = { ok: false, why: `네이버에 닿지 못했습니다 — ${(err as Error).message}` };
    }
  }
  if (마지막.status === 401 || 마지막.status === 403) {
    마지막.why = `검색어트렌드 키가 맞지 않습니다 (${마지막.status}). API HUB 앱에서 «검색어트렌드» 를 골랐는지 보아 주세요.`;
  }
  return 마지막;
}


/* ── 일 단위 — 🔥 급상승(B) ─────────────────────────────────────────────
 * 월 단위로는 «출시 전날 폭발» 같은 이슈를 못 본다(사장님 실측 10-08, 도깨비의 세계).
 * 최근 30일을 하루 단위로 받아 **최근 3일 평균 ÷ 그 앞 14일 평균** 을 본다.
 */
export interface 일별 { keyword: string; days: { d: string; v: number }[]; surge: number | null }
export type 일별결과 = { ok: true; rows: 일별[] } | 네이버실패;

/** 급상승 % — 최근 3일 평균이 앞 14일 평균보다 50% 넘게 많고, 최근 값이 바닥(5) 위일 때만. 아니면 null. */
export function 급상승보기(값들: number[]): number | null {
  const 뒤 = 값들.slice(-3), 앞 = 값들.slice(-17, -3);
  const 평 = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const 뒤평 = 평(뒤), 앞평 = 평(앞);
  if (뒤평 < 5) return null;
  if (앞평 <= 0) return 뒤평 >= 20 ? 999 : null;   // 전에는 없던 말이 갑자기 — 새 게임 이름이 이렇다
  const pct = Math.round(((뒤평 - 앞평) / 앞평) * 100);
  return pct >= 50 ? Math.min(pct, 999) : null;
}

export async function 일별트렌드(keywords: string[], 날수 = 30): Promise<일별결과> {
  const 말들 = [...new Set(keywords.map((k) => String(k ?? "").trim()).filter(Boolean))].slice(0, 5);
  if (!말들.length) return { ok: false, why: "키워드가 비어 있습니다." };
  const 날짜들 = Array.from({ length: 날수 }, (_, j) => DateTime.now().minus({ days: 날수 - j }).toFormat("yyyy-MM-dd"));

  if (가짜모드()) {
    const 자료 = 가짜자료()?.trendDaily ?? {};
    if (자료.fail) return { ok: false, why: String(자료.fail) };
    return { ok: true, rows: 말들.map((k) => {
      const 값들: number[] = 자료[k] ?? 날짜들.map(() => 30);
      return { keyword: k, days: 값들.map((v, j) => ({ d: 날짜들[j] ?? "", v })), surge: 급상승보기(값들) };
    }) };
  }

  const 키 = 네이버키들();
  if (!키.searchId || !키.searchSecret) return { ok: false, why: "블로그 검색 API 키(Client ID·Secret)가 아직 없습니다." };
  const 본문 = JSON.stringify({
    startDate: 날짜들[0], endDate: DateTime.now().minus({ days: 1 }).toFormat("yyyy-MM-dd"), timeUnit: "date",
    keywordGroups: 말들.map((k) => ({ groupName: k, keywords: [k] })),
  });
  let 마지막: 네이버실패 = { ok: false, why: "네이버에 닿지 못했습니다." };
  for (const 창 of 창구) {
    try {
      const res = await fetch(창.주소, {
        method: "POST",
        headers: { ...창.헤더(키.searchId, 키.searchSecret), "Content-Type": "application/json" },
        body: 본문,
        signal: AbortSignal.timeout(네이버한도ms),
      });
      const 글 = await res.text();
      if (res.ok) {
        const 답 = JSON.parse(글);
        const rows = (Array.isArray(답?.results) ? 답.results : []).map((r: any) => {
          const 받은 = new Map((Array.isArray(r?.data) ? r.data : []).map((d: any) => [String(d?.period ?? ""), Number(d?.ratio) || 0]));
          // 검색이 없던 날은 데이터랩이 빼고 준다 — 0 으로 채워야 «갑자기 뜬 말» 이 보인다.
          const days = 날짜들.map((d) => ({ d, v: Number(받은.get(d) ?? 0) }));
          return { keyword: String(r?.title ?? ""), days, surge: 급상승보기(days.map((x) => x.v)) };
        }).filter((r: 일별) => r.keyword);
        return { ok: true, rows };
      }
      마지막 = { ok: false, status: res.status, why: 코드사유(res.status, 글) };
      if (![401, 403, 404].includes(res.status)) return 마지막;
    } catch (err) {
      마지막 = { ok: false, why: `네이버에 닿지 못했습니다 — ${(err as Error).message}` };
    }
  }
  if (마지막.status === 401 || 마지막.status === 403) {
    마지막.why = `검색어트렌드 키가 맞지 않습니다 (${마지막.status}). API HUB 앱에서 «검색어트렌드» 를 골랐는지 보아 주세요.`;
  }
  return 마지막;
}
