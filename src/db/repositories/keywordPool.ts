/**
 * 네이버 키워드 보관함 (`keyword_pool`). 모두 지금 자리(owner_key)로 거른다.
 *
 * 상태: candidate(대기) · used(씀) · hold(보류).
 * 다시 모을 때는 **대기만 바꾸고** 씀·보류는 그대로 둔다 — 쓴 키워드가 다시
 * 나오거나, 사장님이 보류해 둔 것이 되살아나면 안 된다.
 */
import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";
import { 쓰는등급, type 등급 } from "../../naver/키워드점수.js";

export interface 보관키워드 {
  id: number;
  category_id: number;
  keyword: string;
  pc: number;
  mobile: number;
  comp: string;
  doc_total: number | null;
  ratio: number | null;
  grade: 등급;
  seed: string | null;
  top_json: string | null;
  status: "candidate" | "used" | "hold";
  fetched_at: string | null;
  used_at: string | null;
}

export interface 넣을키워드 {
  keyword: string;
  pc: number;
  mobile: number;
  comp: string;
  doc_total: number | null;
  ratio: number | null;
  grade: 등급;
  seed: string;
  top: { title: string; desc: string; date: string }[];
}

const 차례식 = `CASE grade WHEN 'gold' THEN 0 WHEN 'silver' THEN 1 WHEN 'bronze' THEN 2 WHEN 'etc' THEN 3 ELSE 4 END`;

export function 보관함목록(categoryId: number): 보관키워드[] {
  return getDb().prepare(
    `SELECT * FROM keyword_pool WHERE owner_key = ? AND category_id = ?
     ORDER BY CASE status WHEN 'candidate' THEN 0 WHEN 'hold' THEN 1 ELSE 2 END, ${차례식}, (COALESCE(pc,0) + COALESCE(mobile,0)) DESC`,
  ).all(지금주인(), categoryId) as 보관키워드[];
}

/** 한 줄 넣기(이미 있으면 숫자만 바꿈). 씀·보류는 상태를 건드리지 않는다. */
export function 보관함넣기(categoryId: number, 줄: 넣을키워드): void {
  getDb().prepare(
    `INSERT INTO keyword_pool (owner_key, category_id, keyword, pc, mobile, comp, doc_total, ratio, grade, seed, top_json, status, fetched_at)
     VALUES (@owner, @cat, @keyword, @pc, @mobile, @comp, @doc, @ratio, @grade, @seed, @top, 'candidate', @at)
     ON CONFLICT(owner_key, category_id, keyword) DO UPDATE SET
       pc = excluded.pc, mobile = excluded.mobile, comp = excluded.comp, doc_total = excluded.doc_total,
       ratio = excluded.ratio, grade = excluded.grade, seed = excluded.seed, top_json = excluded.top_json,
       fetched_at = excluded.fetched_at`,
  ).run({
    owner: 지금주인(), cat: categoryId, keyword: 줄.keyword, pc: 줄.pc, mobile: 줄.mobile, comp: 줄.comp,
    doc: 줄.doc_total, ratio: 줄.ratio, grade: 줄.grade, seed: 줄.seed,
    top: JSON.stringify(줄.top.slice(0, 10)), at: new Date().toISOString(),
  });
}

/** 다 모은 뒤: 이번에 남길 것(keep) 밖의 «대기» 줄은 지운다. 씀·보류는 남긴다. */
export function 보관함정리(categoryId: number, keep: string[]): void {
  const db = getDb();
  const 남길 = new Set(keep);
  const 대기 = db.prepare(
    "SELECT id, keyword FROM keyword_pool WHERE owner_key = ? AND category_id = ? AND status = 'candidate'",
  ).all(지금주인(), categoryId) as { id: number; keyword: string }[];
  const 지우기 = db.prepare("DELETE FROM keyword_pool WHERE id = ?");
  db.transaction(() => { for (const 줄 of 대기) if (!남길.has(줄.keyword)) 지우기.run(줄.id); })();
}

/** 글쓰기가 쓸 다음 키워드 — 골드 → 실버 → 브론즈, 같은 등급이면 검색량 많은 순. */
export function 다음키워드(categoryId: number): 보관키워드 | null {
  const 등급들 = 쓰는등급.map((g) => `'${g}'`).join(",");
  return (getDb().prepare(
    `SELECT * FROM keyword_pool WHERE owner_key = ? AND category_id = ? AND status = 'candidate' AND grade IN (${등급들})
     ORDER BY ${차례식}, (COALESCE(pc,0) + COALESCE(mobile,0)) DESC LIMIT 1`,
  ).get(지금주인(), categoryId) as 보관키워드 | undefined) ?? null;
}

/** 다음 키워드 말고 그다음 몇 개 — 지시문의 «연관 키워드» 로 준다. */
export function 연관보관키워드(categoryId: number, 빼기: number, 개수 = 5): string[] {
  const 등급들 = 쓰는등급.map((g) => `'${g}'`).join(",");
  return (getDb().prepare(
    `SELECT keyword FROM keyword_pool WHERE owner_key = ? AND category_id = ? AND id != ? AND status != 'hold' AND grade IN (${등급들})
     ORDER BY ${차례식}, (COALESCE(pc,0) + COALESCE(mobile,0)) DESC LIMIT ?`,
  ).all(지금주인(), categoryId, 빼기, 개수) as { keyword: string }[]).map((r) => r.keyword);
}

export function 키워드썼음(id: number): void {
  getDb().prepare("UPDATE keyword_pool SET status = 'used', used_at = ? WHERE id = ? AND owner_key = ?")
    .run(new Date().toISOString(), id, 지금주인());
}

export function 키워드상태(id: number, status: "candidate" | "hold"): boolean {
  const r = getDb().prepare("UPDATE keyword_pool SET status = ? WHERE id = ? AND owner_key = ? AND status != 'used'")
    .run(status, id, 지금주인());
  return r.changes > 0;
}

/** 카테고리별 개수 — 탭의 숫자 카드와 «모은 키워드» 칸. */
export function 보관함개수(categoryId: number): Record<등급 | "all" | "hold" | "used", number> {
  const 줄들 = getDb().prepare(
    "SELECT grade, status, COUNT(*) AS n FROM keyword_pool WHERE owner_key = ? AND category_id = ? GROUP BY grade, status",
  ).all(지금주인(), categoryId) as { grade: 등급; status: string; n: number }[];
  const 답 = { all: 0, gold: 0, silver: 0, bronze: 0, etc: 0, unknown: 0, hold: 0, used: 0 };
  for (const 줄 of 줄들) {
    if (줄.status === "hold") { 답.hold += 줄.n; continue; }
    if (줄.status === "used") { 답.used += 줄.n; continue; }
    답.all += 줄.n;
    답[줄.grade] += 줄.n;
  }
  return 답;
}
