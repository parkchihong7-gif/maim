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
  /** 누구의 자리인가. 빈 값이면 주인 것. tenancy.ts 참고 */
  owner_key: string;
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
}): Category {
  const result = getDb()
    .prepare(
      "INSERT INTO categories (name, requires_search, prompt_hint, active, topic_keyword, owner_key) VALUES (?, ?, ?, 1, ?, ?)",
    )
    .run(input.name, input.requiresSearch ? 1 : 0, input.promptHint, input.topicKeyword || null, 지금주인());
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
  }>,
): void {
  const current = getCategory(id);
  if (!current) throw new Error(`Category ${id} not found`);
  getDb()
    .prepare(
      "UPDATE categories SET name = ?, requires_search = ?, prompt_hint = ?, active = ?, topic_keyword = ? WHERE id = ? AND owner_key = ?",
    )
    .run(
      input.name ?? current.name,
      input.requiresSearch !== undefined ? (input.requiresSearch ? 1 : 0) : current.requires_search,
      input.promptHint ?? current.prompt_hint,
      input.active !== undefined ? (input.active ? 1 : 0) : current.active,
      input.topicKeyword !== undefined ? input.topicKeyword || null : current.topic_keyword,
      id,
      지금주인(),
    );
}

export function deleteCategory(id: number): void {
  getDb().prepare("DELETE FROM categories WHERE id = ? AND owner_key = ?").run(id, 지금주인());
}

export function markCategoryUsed(id: number): void {
  getDb()
    .prepare("UPDATE categories SET last_used_at = datetime('now') WHERE id = ? AND owner_key = ?")
    .run(id, 지금주인());
}

/** 활성 카테고리 전체를 가볍게 섞어서 반환한다 (하루 생성 개수 제한이 없으므로 전부 처리). */
export function pickCategoriesForToday(): Category[] {
  const active = listActiveCategories();
  const shuffled = [...active];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
