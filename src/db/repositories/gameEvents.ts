/**
 * 🎮 출시·업데이트 달력 (`game_events`). 모두 지금 자리(owner_key)로 거른다.
 */
import { DateTime } from "luxon";
import { getDb } from "../index.js";
import { 지금주인 } from "../../tenancy.js";
import type { 단계기록 } from "../../pipeline/출시계획.js";

export interface 게임일정 {
  id: number;
  owner_key: string;
  category_id: number | null;
  title: string;
  kind: string;
  date: string;
  note: string | null;
  source: string | null;
  steps_json: string;
  created_at: string;
}

export function 일정목록(): 게임일정[] {
  return getDb().prepare("SELECT * FROM game_events WHERE owner_key = ? ORDER BY date ASC, id ASC").all(지금주인()) as 게임일정[];
}

export function 일정읽기(id: number): 게임일정 | null {
  return (getDb().prepare("SELECT * FROM game_events WHERE id = ? AND owner_key = ?").get(id, 지금주인()) as 게임일정 | undefined) ?? null;
}

export function 일정넣기(값: { title: string; date: string; kind?: string; categoryId?: number | null; note?: string | null; source?: string | null }): 게임일정 {
  const r = getDb().prepare(
    "INSERT INTO game_events (owner_key, category_id, title, kind, date, note, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(지금주인(), 값.categoryId ?? null, 값.title, 값.kind || "release", 값.date, 값.note ?? null, 값.source ?? null);
  return 일정읽기(Number(r.lastInsertRowid))!;
}

export function 일정고치기(id: number, 값: { title?: string; date?: string; kind?: string; categoryId?: number | null; note?: string | null }): boolean {
  const 지금것 = 일정읽기(id);
  if (!지금것) return false;
  getDb().prepare("UPDATE game_events SET title = ?, date = ?, kind = ?, category_id = ?, note = ? WHERE id = ? AND owner_key = ?").run(
    값.title ?? 지금것.title, 값.date ?? 지금것.date, 값.kind ?? 지금것.kind,
    값.categoryId === undefined ? 지금것.category_id : 값.categoryId, 값.note === undefined ? 지금것.note : 값.note,
    id, 지금주인(),
  );
  return true;
}

export function 일정지우기(id: number): boolean {
  return getDb().prepare("DELETE FROM game_events WHERE id = ? AND owner_key = ?").run(id, 지금주인()).changes > 0;
}

export function 단계기록들(e: 게임일정): Record<string, 단계기록> {
  try { return JSON.parse(e.steps_json || "{}"); } catch { return {}; }
}

export function 단계적기(id: number, key: string, 값: 단계기록 | null): void {
  const e = 일정읽기(id);
  if (!e) return;
  const 기록 = 단계기록들(e);
  if (값 === null) delete 기록[key]; else 기록[key] = 값;
  getDb().prepare("UPDATE game_events SET steps_json = ? WHERE id = ? AND owner_key = ?").run(JSON.stringify(기록), id, 지금주인());
}

/** 🔥 급상승 찾기가 같이 볼 게임 이름 — 출시가 앞뒤로 가까운 것(−7일 ~ +30일). 카테고리가 같거나 정해지지 않은 것. */
export function 다가오는일정말(categoryId: number, 오늘 = DateTime.now()): string[] {
  const 앞 = 오늘.minus({ days: 7 }).toFormat("yyyy-MM-dd"), 뒤 = 오늘.plus({ days: 30 }).toFormat("yyyy-MM-dd");
  try {
    return (getDb().prepare(
      "SELECT title FROM game_events WHERE owner_key = ? AND date BETWEEN ? AND ? AND (category_id IS NULL OR category_id = ?)",
    ).all(지금주인(), 앞, 뒤, categoryId) as { title: string }[]).map((r) => r.title);
  } catch { return []; }
}
