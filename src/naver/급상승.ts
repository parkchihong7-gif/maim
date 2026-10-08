/**
 * **🔥 급상승 키워드 찾기(B)** — 보관함 대기 키워드(+ 🎮 달력의 게임 이름)를 일 단위로 보고,
 * 갑자기 뜬 말에 표시를 단다. 표시가 붙은 말은 등급(비율)과 상관없이 **글쓰기 맨 앞**.
 *
 *   1) 데이터랩 일 단위 30일 — 최근 3일 ÷ 앞 14일 이 +50% 넘으면 급상승
 *   2) 급상승이면 네이버 뉴스(최신순 20건)로 «최근 3일 기사 수» 를 붙여 진짜 이슈인지 보인다
 * 급상승 표시는 72시간이 지나면 글쓰기 순서에서 힘을 잃는다(keywordPool.쓸차례).
 * 실패해도 던지지 않는다.
 */
import { DateTime } from "luxon";
import { 일별트렌드 } from "./검색어트렌드.js";
import { 뉴스검색 } from "./블로그검색.js";
import { 의도보기 } from "./키워드점수.js";
import { 보관함목록, 급상승적기, 급상승비우기 } from "../db/repositories/keywordPool.js";

export const 급상승확인개수 = 25;

export interface 급상승줄 { keyword: string; surge: number; news3d: number | null; newsTitle: string; inPool: boolean }

/** 뉴스 날짜(RFC 822 «Wed, 08 Oct 2026 09:00:00 +0900») 가 최근 n일 안인가. */
export function 최근기사인가(날: string, n = 3, 지금 = DateTime.now()): boolean {
  const d = DateTime.fromRFC2822(String(날 ?? ""));
  return d.isValid && 지금.diff(d, "days").days <= n;
}

export async function 급상승찾기(categoryId: number, 더볼말: string[] = []): Promise<{ checked: number; rows: 급상승줄[]; why: string | null }> {
  const 대기 = 보관함목록(categoryId)
    .filter((r) => r.status === "candidate" && 의도보기(r.keyword) !== "nav")
    .sort((a, b) => ((b.pc ?? 0) + (b.mobile ?? 0)) - ((a.pc ?? 0) + (a.mobile ?? 0)))
    .slice(0, 급상승확인개수);
  const 보관말 = new Map(대기.map((r) => [r.keyword, r]));
  const 볼말 = [...new Set([...대기.map((r) => r.keyword), ...더볼말.map((x) => x.trim()).filter(Boolean)])];
  if (!볼말.length) return { checked: 0, rows: [], why: "볼 키워드가 없습니다 — 보관함을 먼저 모으거나 🎮 달력에 게임을 넣어 주세요." };

  급상승비우기(categoryId);
  const rows: 급상승줄[] = [];
  let 한 = 0;
  let 까닭: string | null = null;
  for (let i = 0; i < 볼말.length; i += 5) {
    const 답 = await 일별트렌드(볼말.slice(i, i + 5));
    if (!답.ok) { 까닭 = 답.why; break; }
    for (const t of 답.rows) {
      한 += 1;
      if (t.surge === null) continue;
      const 뉴스 = await 뉴스검색(t.keyword, 20);
      const news3d = 뉴스.ok ? 뉴스.items.filter((x) => 최근기사인가(x.date)).length : null;
      const newsTitle = 뉴스.ok ? (뉴스.items[0]?.title ?? "") : "";
      const 줄 = 보관말.get(t.keyword);
      if (줄) 급상승적기(줄.id, t.surge, { days: t.days.slice(-17).map((x) => x.v), news3d, newsTitle, at: new Date().toISOString() });
      rows.push({ keyword: t.keyword, surge: t.surge, news3d, newsTitle, inPool: !!줄 });
    }
  }
  rows.sort((a, b) => b.surge - a.surge);
  return { checked: 한, rows, why: 까닭 };
}
