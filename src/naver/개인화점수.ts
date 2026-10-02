/**
 * **개인화 점수(0~100)** — 이 키워드가 «내 블로그에 맞는가» 를 AI 없이 셈한다. 근거를 같이 돌려준다.
 *
 *   등급(문서 수 ÷ 검색량)      골드 40 · 실버 32 · 브론즈 24 · 그 외 10 · 미확인 15
 *   내 블로그와 맞는 말          카테고리(이름·설명·함께 들어갈 말·내 경험) · 승인한 스타일(주제·독자)의 낱말이
 *                               키워드에 들어 있으면 하나에 20, 최대 40
 *   검색량                       300~5,000 이 20(쓰기 좋음) · 100~300·5,000~20,000 이 12 · 그 밖 6
 *
 * 도톨이의 «개인화 점수» 라는 이름만 참고했다. 그쪽 계산식은 공개되지 않았고 이것과 다르다.
 */
import type { Category } from "../db/repositories/categories.js";
import { 낱말들 } from "./낱말세기.js";

export interface 점수 { score: number; why: string[] }

const 등급점수: Record<string, [number, string]> = {
  gold: [40, "골드"], silver: [32, "실버"], bronze: [24, "브론즈"], etc: [10, "그 외 등급"], unknown: [15, "등급 미확인"],
};

/** 내 블로그를 나타내는 낱말들(두 글자 이상). 한 번 만들어 여러 키워드에 쓴다. */
export function 내낱말(category: Category | null, 스타일?: { topic?: string; readers?: string } | null): string[] {
  const 글 = [
    category?.name, category?.prompt_hint, category?.topic_keyword, category?.must_keywords, category?.my_note,
    스타일?.topic, 스타일?.readers,
  ].filter(Boolean).join(" ");
  return [...new Set(낱말들(글))].filter((w) => w.length >= 2).slice(0, 80);
}

export function 개인화점수(row: { keyword: string; grade: string; pc: number | null; mobile: number | null }, 낱말: string[]): 점수 {
  const why: string[] = [];
  const [g, gName] = 등급점수[row.grade] ?? 등급점수.unknown;
  why.push(`${gName} +${g}`);
  const 붙인 = row.keyword.replace(/\s+/g, "");
  const 맞은 = 낱말.filter((w) => 붙인.includes(w)).sort((a, b) => b.length - a.length);
  const 맞음 = Math.min(40, 맞은.length * 20);
  why.push(맞은.length ? `내 블로그 말 «${맞은.slice(0, 2).join("·")}» +${맞음}` : "내 블로그 말과 겹침 없음 +0");
  const 량 = (row.pc ?? 0) + (row.mobile ?? 0);
  const 량점 = 량 >= 300 && 량 <= 5000 ? 20 : (량 >= 100 && 량 < 300) || (량 > 5000 && 량 <= 20000) ? 12 : 6;
  why.push(`검색량 ${량.toLocaleString()} +${량점}`);
  return { score: Math.min(100, g + 맞음 + 량점), why };
}
