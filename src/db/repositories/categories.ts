import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";

export interface Category {
  id: number;
  name: string;
  requires_search: 0 | 1;
  prompt_hint: string;
  active: 0 | 1;
  last_used_at: string | null;
  created_at: string;
  topic_keyword: string | null;
  /** 예전의 «하루 편수». 이제 쓰지 않는다 — 늘 1. db/index.ts 참고 */
  daily_count: number;
  /** 누구의 자리인가. 빈 값이면 주인 것. tenancy.ts 참고 */
  owner_key: string;
  /** 함께 들어갈 말 — 키워드의 뜻을 좁힌다 (쉼표로 여럿) */
  must_keywords: string | null;
  /** 빼야 할 말 — 같은 글자의 다른 뜻 (쉼표로 여럿) */
  exclude_keywords: string | null;
  /** 이 카테고리의 참고 주소 (줄마다 하나) */
  reference_urls: string | null;
  /** 이 카테고리의 대표 주소 — 가장 먼저 여는 기준 출처 (하나) */
  main_url: string | null;
  /** 1 이면 주제 키워드를 쓰고 나서도 비우지 않는다 */
  keyword_keep: 0 | 1;
  /** 첫 글 때 주소를 읽고 남긴 자료 메모. pipeline/자료메모.ts 참고 */
  research_brief: string | null;
  brief_sig: string | null;
  brief_at: string | null;
}

/** 참고 주소를 다듬는다 — http(s) 만, 줄마다 하나, 10개까지. */
export function 주소다듬기(글: string | null | undefined): string | null {
  const 줄 = String(글 ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
    .filter((x) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(x)).map((x) => x.slice(0, 300));
  const 하나씩 = [...new Set(줄)].slice(0, 10);
  return 하나씩.length ? 하나씩.join("\n") : null;
}

/** 대표 주소 — 하나만. 여러 개가 오면 첫 번째. */
export function 대표주소다듬기(글: string | null | undefined): string | null {
  const 다듬은 = 주소다듬기(글);
  return 다듬은 ? 다듬은.split("\n")[0] : null;
}

/** 쉼표로 적은 말들을 다듬는다 — 겹친 것 빼고 15개까지. */
export function 말다듬기(글: string | null | undefined): string | null {
  const 말 = String(글 ?? "").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 40));
  const 하나씩 = [...new Set(말)].slice(0, 15);
  return 하나씩.length ? 하나씩.join(", ") : null;
}

export function listActiveCategories(): Category[] {
  return getDb()
    .prepare("SELECT * FROM categories WHERE owner_key = ? AND active = 1 ORDER BY last_used_at IS NOT NULL, last_used_at ASC")
    .all(지금주인()) as Category[];
}

export function listAllCategories(): Category[] {
  return getDb().prepare("SELECT * FROM categories WHERE owner_key = ? ORDER BY id ASC").all(지금주인()) as Category[];
}

export function getCategory(id: number): Category | undefined {
  return getDb().prepare("SELECT * FROM categories WHERE id = ? AND owner_key = ?").get(id, 지금주인()) as Category | undefined;
}

export function createCategory(input: {
  name: string;
  requiresSearch: boolean;
  promptHint: string;
  topicKeyword?: string | null;
  mustKeywords?: string | null;
  excludeKeywords?: string | null;
  referenceUrls?: string | null;
  mainUrl?: string | null;
  keywordKeep?: boolean;
}): Category {
  const result = getDb()
    .prepare(
      "INSERT INTO categories (name, requires_search, prompt_hint, active, topic_keyword, daily_count, owner_key,"
      + " must_keywords, exclude_keywords, reference_urls, keyword_keep, main_url) VALUES (?, ?, ?, 1, ?, 1, ?, ?, ?, ?, ?, ?)",
    )
    .run(input.name, input.requiresSearch ? 1 : 0, input.promptHint, input.topicKeyword || null,
         지금주인(),
         말다듬기(input.mustKeywords), 말다듬기(input.excludeKeywords), 주소다듬기(input.referenceUrls),
         input.keywordKeep ? 1 : 0, 대표주소다듬기(input.mainUrl));
  return getCategory(Number(result.lastInsertRowid))!;
}

export function updateCategory(
  id: number,
  input: Partial<{
    name: string;
    requiresSearch: boolean;
    promptHint: string;
    active: boolean;
    topicKeyword: string | null;
    mustKeywords: string | null;
    excludeKeywords: string | null;
    referenceUrls: string | null;
    mainUrl: string | null;
    keywordKeep: boolean;
  }>,
): void {
  const current = getCategory(id);
  if (!current) throw new Error(`Category ${id} not found`);
  getDb()
    .prepare(
      "UPDATE categories SET name = ?, requires_search = ?, prompt_hint = ?, active = ?, topic_keyword = ?,"
      + " must_keywords = ?, exclude_keywords = ?, reference_urls = ?, keyword_keep = ?, main_url = ? WHERE id = ? AND owner_key = ?",
    )
    .run(
      input.name ?? current.name,
      input.requiresSearch !== undefined ? (input.requiresSearch ? 1 : 0) : current.requires_search,
      input.promptHint ?? current.prompt_hint,
      input.active !== undefined ? (input.active ? 1 : 0) : current.active,
      input.topicKeyword !== undefined ? input.topicKeyword || null : current.topic_keyword,
      input.mustKeywords !== undefined ? 말다듬기(input.mustKeywords) : current.must_keywords,
      input.excludeKeywords !== undefined ? 말다듬기(input.excludeKeywords) : current.exclude_keywords,
      input.referenceUrls !== undefined ? 주소다듬기(input.referenceUrls) : current.reference_urls,
      input.keywordKeep !== undefined ? (input.keywordKeep ? 1 : 0) : (current.keyword_keep ?? 0),
      input.mainUrl !== undefined ? 대표주소다듬기(input.mainUrl) : (current.main_url ?? null),
      id,
      지금주인(),
    );
}

/** 자료 메모를 적는다. 빈 값이면 지운다 — 다음 글이 주소를 다시 읽는다. */
export function 메모적기(id: number, 메모: string | null, 지문: string | null): void {
  getDb().prepare(
    "UPDATE categories SET research_brief = ?, brief_sig = ?, brief_at = ? WHERE id = ? AND owner_key = ?",
  ).run(메모, 메모 ? 지문 : null, 메모 ? new Date().toISOString() : null, id, 지금주인());
}

export function deleteCategory(id: number): void {
  getDb().prepare("DELETE FROM categories WHERE id = ? AND owner_key = ?").run(id, 지금주인());
}

export function markCategoryUsed(id: number): void {
  getDb()
    .prepare("UPDATE categories SET last_used_at = datetime('now') WHERE id = ? AND owner_key = ?")
    .run(id, 지금주인());
}
