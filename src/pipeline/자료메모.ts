/**
 * **자료 메모 — 주소는 한 번만 읽는다.**
 *
 * 주소를 열어 읽은 것을 짧은 메모로 남겨 두고, 다음 글부터는 주소를 다시 열지
 * 않고 이 메모를 쓴다. 메모는 두 가지다.
 *
 *   블로그 메모     [관리자 설정 → 블로그 주제 설정]의 참고 주소. **자리에 하나** —
 *                   모든 카테고리가 같이 쓴다. 예전에는 카테고리마다 따로 읽어서,
 *                   «검색 없이 창작» 카테고리까지 글마다 이 주소들을 열었다(10분 넘김).
 *   카테고리 메모   그 카테고리의 대표·참고 주소. 카테고리마다.
 *
 * 이럴 때 버리고 다시 읽는다.
 *   - 주소(또는 카테고리 이름·설명)가 바뀌었을 때 (지문이 달라짐)
 *   - 만든 지 7일이 지났을 때
 *   - [🔄 다시 읽기] 를 누르셨을 때 (카테고리 메모)
 */
import { createHash } from "node:crypto";
import type { Category } from "../db/repositories/categories.js";
import { 개인설정, 개인설정정하기 } from "../db/repositories/settings.js";

/** 메모를 믿고 쓰는 기간. 지나면 주소를 다시 읽는다. */
export const 메모유효일 = 7;

function 지문(재료: string[]): string {
  return createHash("sha1").update(재료.join("␞")).digest("hex").slice(0, 16);
}

export interface 자료메모 { text: string; at: string }

function 싱싱한가(at: string | null | undefined, 지금: number): boolean {
  const 만든때 = Date.parse(at ?? "");
  return Number.isFinite(만든때) && 지금 - 만든때 <= 메모유효일 * 86_400_000;
}

// ── 카테고리 메모 ─────────────────────────────────────────────

/** 카테고리 메모에 들어 있는 것의 지문 — 이것이 바뀌면 메모도 낡은 것이다. */
export function 메모지문(category: Category): string {
  return 지문([category.name, category.prompt_hint, category.main_url ?? "", category.reference_urls ?? ""]);
}

/** 이 카테고리에 읽어 둘 주소가 있는가. */
export function 카테고리주소있나(category: Category): boolean {
  return !!(category.main_url ?? "").trim() || !!(category.reference_urls ?? "").trim();
}

/** 지금 쓸 수 있는 카테고리 메모. 없거나 낡았으면 null. */
export function 쓸메모(category: Category, 지금 = Date.now()): 자료메모 | null {
  const text = (category.research_brief ?? "").trim();
  if (!text || !category.brief_at) return null;
  if (category.brief_sig !== 메모지문(category)) return null;
  if (!싱싱한가(category.brief_at, 지금)) return null;
  return { text, at: category.brief_at };
}

// ── 블로그 메모 (자리에 하나) ─────────────────────────────────

const 블로그메모키 = "blog_links_brief";

export function 블로그메모지문(블로그주소글: string | null | undefined): string {
  return 지문([블로그주소글 ?? ""]);
}

/** 지금 쓸 수 있는 블로그 메모. 없거나 주소가 바뀌었거나 낡았으면 null. */
export function 쓸블로그메모(블로그주소글: string | null | undefined, 지금 = Date.now()): 자료메모 | null {
  try {
    const 값 = JSON.parse(개인설정(블로그메모키) ?? "null") as { text?: string; sig?: string; at?: string } | null;
    if (!값?.text?.trim() || !값.at) return null;
    if (값.sig !== 블로그메모지문(블로그주소글)) return null;
    if (!싱싱한가(값.at, 지금)) return null;
    return { text: 값.text.trim(), at: 값.at };
  } catch {
    return null;
  }
}

export function 블로그메모적기(블로그주소글: string | null | undefined, text: string | null): void {
  개인설정정하기(블로그메모키, text
    ? JSON.stringify({ text, sig: 블로그메모지문(블로그주소글), at: new Date().toISOString() })
    : null);
}
