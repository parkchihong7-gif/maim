import { getDb } from "../index.js";

export interface Category {
  id: number;
  name: string;
  requires_search: 0 | 1;
  prompt_hint: string;
  active: 0 | 1;
  last_used_at: string | null;
  created_at: string;
}

export function listActiveCategories(): Category[] {
  return getDb()
    .prepare("SELECT * FROM categories WHERE active = 1 ORDER BY last_used_at IS NOT NULL, last_used_at ASC")
    .all() as Category[];
}

export function listAllCategories(): Category[] {
  return getDb().prepare("SELECT * FROM categories ORDER BY id ASC").all() as Category[];
}

export function getCategory(id: number): Category | undefined {
  return getDb().prepare("SELECT * FROM categories WHERE id = ?").get(id) as Category | undefined;
}

export function createCategory(input: {
  name: string;
  requiresSearch: boolean;
  promptHint: string;
}): Category {
  const result = getDb()
    .prepare(
      "INSERT INTO categories (name, requires_search, prompt_hint, active) VALUES (?, ?, ?, 1)",
    )
    .run(input.name, input.requiresSearch ? 1 : 0, input.promptHint);
  return getCategory(Number(result.lastInsertRowid))!;
}

export function updateCategory(
  id: number,
  input: Partial<{ name: string; requiresSearch: boolean; promptHint: string; active: boolean }>,
): void {
  const current = getCategory(id);
  if (!current) throw new Error(`Category ${id} not found`);
  getDb()
    .prepare(
      "UPDATE categories SET name = ?, requires_search = ?, prompt_hint = ?, active = ? WHERE id = ?",
    )
    .run(
      input.name ?? current.name,
      input.requiresSearch !== undefined ? (input.requiresSearch ? 1 : 0) : current.requires_search,
      input.promptHint ?? current.prompt_hint,
      input.active !== undefined ? (input.active ? 1 : 0) : current.active,
      id,
    );
}

export function deleteCategory(id: number): void {
  getDb().prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function markCategoryUsed(id: number): void {
  getDb()
    .prepare("UPDATE categories SET last_used_at = datetime('now') WHERE id = ?")
    .run(id);
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
