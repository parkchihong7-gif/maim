/**
 * **글쓰기가 보관함을 쓰는 곳** — 여기 하나뿐이다.
 *
 * 네이버를 부르지 않는다. 미리 모아 둔 표를 읽기만 한다(1초도 안 걸림).
 * 다음 셋이 모두 맞을 때만 쓴다. 하나라도 아니면 null — 예전과 똑같이 쓴다.
 *   1) 카테고리에서 [포스팅에 적용] 을 켰다 (kw_apply = 1)
 *   2) 주제 키워드 칸이 비어 있다 — 직접 적은 것이 먼저다
 *   3) 보관함에 쓸 키워드(골드·실버·브론즈 대기)가 있다
 * 읽다가 탈이 나도 null. 글이 늦어지거나 멈추면 안 된다.
 */
import type { Category } from "../db/repositories/categories.js";
import { 다음키워드, 연관보관키워드, type 보관키워드 } from "../db/repositories/keywordPool.js";
import { 검색량등급, 등급이름 } from "./키워드점수.js";

export interface 고른키워드 {
  kw: 보관키워드;
  /** 지시문에 넣을 [키워드 데이터] 블록 (1200자 이하) */
  자료: string;
}

export const 자료최대 = 1200;

export function 보관함키워드고르기(category: Category): 고른키워드 | null {
  try {
    if (!category.kw_apply) return null;
    if ((category.topic_keyword ?? "").trim()) return null;
    const kw = 다음키워드(category.id);
    if (!kw) return null;
    const 연관 = 연관보관키워드(category.id, kw.id, 5);
    let 상위: string[] = [];
    try { 상위 = (JSON.parse(kw.top_json ?? "[]") as { title: string }[]).map((x) => x.title).filter(Boolean).slice(0, 10); } catch { 상위 = []; }
    return { kw, 자료: 키워드자료(kw, 연관, 상위) };
  } catch (err) {
    console.warn(`[보관함] 읽다 탈이 나 예전 방식으로 씁니다: ${(err as Error).message}`);
    return null;
  }
}

export function 키워드자료(kw: 보관키워드, 연관: string[], 상위: string[]): string {
  const 검색량 = (kw.pc ?? 0) + (kw.mobile ?? 0);
  const 줄: string[] = [
    "[키워드 데이터 — 네이버 검색광고·블로그 검색에서 미리 모아 둔 숫자]",
    `- 메인 키워드: "${kw.keyword}" (월 검색량 ${검색량등급(검색량)}, 등급 ${등급이름[kw.grade]}${kw.ratio !== null ? ` · 문서 수 ÷ 검색량 ${kw.ratio}` : ""})`,
    "  위 [최우선 지시] 의 주제 키워드와 같은 말이다. 띄어쓰기는 자연스럽게 고쳐 써도 된다.",
  ];
  if (연관.length) {
    줄.push(`- 연관 키워드: ${연관.join(", ")}`);
    줄.push("  제목 앞머리 조합과 태그 후보로 먼저 써라. 억지로 다 넣지는 마라.");
  }
  if (상위.length) {
    줄.push("- 지금 네이버 상위 글 제목 (형식·길이·다루는 소주제 참고용 — **문장과 제목을 베끼지 말고**, 이 글들이 다루지 않은 쪽을 보태라):");
    for (const t of 상위) 줄.push(`  · ${t}`);
  }
  let 글 = 줄.join("\n");
  if (글.length > 자료최대) 글 = 글.slice(0, 자료최대 - 1) + "…";
  return 글;
}
