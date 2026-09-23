import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";
import { 카테고리상한 } from "../../scheduler/예약.js";

/** 편수는 0~10 사이여야 한다. 화면을 안 거치고 들어오는 길도 있어서 여기서 막는다. */
function 맞춘편수(값: number | undefined): number {
  const n = Math.floor(Number(값));
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(카테고리상한, n));
}

export interface Category {
  id: number;
  name: string;
  requires_search: 0 | 1;
  prompt_hint: string;
  active: 0 | 1;
  last_used_at: string | null;
  created_at: string;
  topic_keyword: string | null;
  /** 하루에 몇 편 준비할지 (0~10). 0 이면 쉰다. scheduler/예약.ts 참고 */
  daily_count: number;
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
  dailyCount?: number;
}): Category {
  const result = getDb()
    .prepare(
      "INSERT INTO categories (name, requires_search, prompt_hint, active, topic_keyword, daily_count, owner_key) VALUES (?, ?, ?, 1, ?, ?, ?)",
    )
    .run(input.name, input.requiresSearch ? 1 : 0, input.promptHint, input.topicKeyword || null,
         맞춘편수(input.dailyCount), 지금주인());
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
    dailyCount: number;
  }>,
): void {
  const current = getCategory(id);
  if (!current) throw new Error(`Category ${id} not found`);
  getDb()
    .prepare(
      "UPDATE categories SET name = ?, requires_search = ?, prompt_hint = ?, active = ?, topic_keyword = ?, daily_count = ? WHERE id = ? AND owner_key = ?",
    )
    .run(
      input.name ?? current.name,
      input.requiresSearch !== undefined ? (input.requiresSearch ? 1 : 0) : current.requires_search,
      input.promptHint ?? current.prompt_hint,
      input.active !== undefined ? (input.active ? 1 : 0) : current.active,
      input.topicKeyword !== undefined ? input.topicKeyword || null : current.topic_keyword,
      input.dailyCount !== undefined ? 맞춘편수(input.dailyCount) : current.daily_count,
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
