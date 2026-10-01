/**
 * **자료 메모 — 주소는 첫 글 때 한 번만 읽는다.**
 *
 * 글 한 편에 6~9분이 걸렸다. 대부분은 쓰는 시간이 아니라 대표·참고 주소와
 * 블로그 참고 주소를 매번 새로 열어 읽는 시간이었다. 그 주소들의 내용은
 * 하루 이틀에 크게 바뀌지 않는다.
 *
 * 그래서 첫 글을 쓸 때 AI 가 읽은 것을 짧은 메모(brief)로 함께 돌려받아
 * 카테고리에 남겨 둔다. 두 번째 글부터는
 *
 *   - 주소를 열지 않고(WebFetch 끔) 메모를 기본 바탕으로 삼고
 *   - 최근 소식만 웹 검색 2~3번으로 확인해서 쓴다.
 *
 * 메모는 이럴 때 버리고 다시 만든다 — 다음 글이 다시 «첫 글» 이 된다.
 *   - 카테고리 이름·설명·대표 주소·참고 주소, 또는 블로그 참고 주소가 바뀌었을 때 (지문이 달라짐)
 *   - 만든 지 7일이 지났을 때 (주소의 새 글을 놓치지 않게)
 *   - [자료 다시 읽기] 를 누르셨을 때
 */
import { createHash } from "node:crypto";
import type { Category } from "../db/repositories/categories.js";

/** 메모를 믿고 쓰는 기간. 지나면 주소를 다시 읽는다. */
export const 메모유효일 = 7;

/** 메모에 들어 있는 것의 지문 — 이것이 바뀌면 메모도 낡은 것이다. */
export function 메모지문(category: Category, 블로그주소글: string | null | undefined): string {
  const 재료 = [
    category.name, category.prompt_hint, category.main_url ?? "", category.reference_urls ?? "",
    String(category.requires_search ?? 0), 블로그주소글 ?? "",
  ].join("␞");
  return createHash("sha1").update(재료).digest("hex").slice(0, 16);
}

/** 읽어 둘 주소나 검색할 것이 있는가 — 없으면 메모도 필요 없다(도구 없이 쓴다). */
export function 조사할것이있나(category: Category, 블로그주소수: number): boolean {
  return category.requires_search === 1 || 블로그주소수 > 0
    || !!(category.main_url ?? "").trim() || !!(category.reference_urls ?? "").trim();
}

export interface 자료메모 { text: string; at: string }

/** 지금 쓸 수 있는 메모. 없거나 낡았으면 null. */
export function 쓸메모(category: Category, 블로그주소글: string | null | undefined, 지금 = Date.now()): 자료메모 | null {
  const text = (category.research_brief ?? "").trim();
  if (!text || !category.brief_at) return null;
  if (category.brief_sig !== 메모지문(category, 블로그주소글)) return null;
  const 만든때 = Date.parse(category.brief_at);
  if (!Number.isFinite(만든때) || 지금 - 만든때 > 메모유효일 * 86_400_000) return null;
  return { text, at: category.brief_at };
}
