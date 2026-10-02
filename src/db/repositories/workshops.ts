/** ✍️ 글 작업실의 작업들. 자리(owner_key)마다 따로. 상태는 state_json 하나에 둔다(src/pipeline/글작업실.ts). */
import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";

export interface 작업줄 {
  id: number; owner_key: string; category_id: number; keyword: string;
  state_json: string; post_id: number | null; created_at: string; updated_at: string;
}

export function 작업목록(): 작업줄[] {
  return getDb().prepare("SELECT * FROM workshops WHERE owner_key = ? ORDER BY updated_at DESC, id DESC LIMIT 20").all(지금주인()) as 작업줄[];
}

export function 작업읽기(id: number): 작업줄 | null {
  return (getDb().prepare("SELECT * FROM workshops WHERE id = ? AND owner_key = ?").get(id, 지금주인()) as 작업줄 | undefined) ?? null;
}

export function 작업넣기(categoryId: number, keyword: string, state: unknown): 작업줄 {
  const r = getDb().prepare("INSERT INTO workshops (owner_key, category_id, keyword, state_json) VALUES (?, ?, ?, ?)")
    .run(지금주인(), categoryId, keyword, JSON.stringify(state));
  return 작업읽기(Number(r.lastInsertRowid))!;
}

export function 작업적기(id: number, state: unknown, postId?: number): void {
  const 글자리 = postId ? ", post_id = @p" : "";
  getDb().prepare(`UPDATE workshops SET state_json = @s, updated_at = datetime('now')${글자리} WHERE id = @id AND owner_key = @o`)
    .run({ s: JSON.stringify(state), id, o: 지금주인(), ...(postId ? { p: postId } : {}) });
}

export function 작업지우기(id: number): boolean {
  return getDb().prepare("DELETE FROM workshops WHERE id = ? AND owner_key = ?").run(id, 지금주인()).changes > 0;
}
