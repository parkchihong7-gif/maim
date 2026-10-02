/**
 * 🎨 내 블로그 분석의 버전들. 자리(1차키)마다 따로다.
 *
 * 분석할 때마다 «초안» 한 줄이 생기고, 사람이 고쳐서 [승인] 하면 approved_at 이 찍힌다.
 * 글쓰기에 쓰는 것은 «쓰는 버전»(개인설정 style_active_id) 하나뿐이다.
 */
import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";

export interface 스타일버전 {
  id: number;
  owner_key: string;
  ver: number;
  blog_id: string;
  post_count: number;
  stats_json: string | null;
  analysis_json: string;
  created_at: string;
  approved_at: string | null;
}

export function 버전목록(): 스타일버전[] {
  return getDb().prepare("SELECT * FROM style_versions WHERE owner_key = ? ORDER BY ver DESC LIMIT 30")
    .all(지금주인()) as 스타일버전[];
}

export function 버전읽기(id: number): 스타일버전 | null {
  return (getDb().prepare("SELECT * FROM style_versions WHERE id = ? AND owner_key = ?")
    .get(id, 지금주인()) as 스타일버전 | undefined) ?? null;
}

export function 버전넣기(v: { blog_id: string; post_count: number; stats: unknown; analysis: unknown }): 스타일버전 {
  const db = getDb();
  const 주인 = 지금주인();
  const 끝 = db.prepare("SELECT COALESCE(MAX(ver), 0) AS n FROM style_versions WHERE owner_key = ?").get(주인) as { n: number };
  const r = db.prepare(`INSERT INTO style_versions (owner_key, ver, blog_id, post_count, stats_json, analysis_json)
    VALUES (?, ?, ?, ?, ?, ?)`).run(주인, 끝.n + 1, v.blog_id, v.post_count, JSON.stringify(v.stats ?? null), JSON.stringify(v.analysis));
  return 버전읽기(Number(r.lastInsertRowid))!;
}

/** 고친 내용을 저장하고 승인한다. */
export function 버전승인(id: number, analysis: unknown): 스타일버전 | null {
  getDb().prepare("UPDATE style_versions SET analysis_json = ?, approved_at = datetime('now') WHERE id = ? AND owner_key = ?")
    .run(JSON.stringify(analysis), id, 지금주인());
  return 버전읽기(id);
}

/** 오늘 이 자리에서 분석한 횟수(체험 상한용). */
export function 오늘분석수(): number {
  const r = getDb().prepare("SELECT COUNT(*) AS n FROM style_versions WHERE owner_key = ? AND created_at >= date('now')")
    .get(지금주인()) as { n: number };
  return r.n;
}
