/**
 * 🕹️ 게임 플레이 저장소 (017). **주인 자리 전용**이라 owner_key 로 거르지 않는다 —
 * 라우트(`routes/game.ts`)가 주인이 아니면 404 로 막는다.
 * (🎮 출시 달력은 `gameEvents.ts` — 이름이 비슷하지만 다른 것)
 */
import crypto from "node:crypto";
import { DateTime } from "luxon";
import { getDb } from "../index.js";
import { getSetting, setSetting } from "./settings.js";
import { config } from "../../config.js";
import { 기본프로필들, 프로필다듬기, type 게임프로필 } from "../../game/프로필.js";
import { 칸들, 채우기, type 칸고름 } from "../../game/미션.js";

const 지금ISO = () => new Date().toISOString();
const json = <T>(글: string | null | undefined, 없으면: T): T => {
  try { return 글 ? (JSON.parse(글) as T) : 없으면; } catch { return 없으면; }
};

// ── 설정 ─────────────────────────────────────────────────────
export interface 게임설정 {
  서버사진보관일: number;   // 발행한 글에 쓴 사진 — 발행 후 이 날수가 지나면 지움
  안쓴사진보관일: number;   // 어떤 글에도 안 쓴 사진
  원본보관일: number;       // 집 PC 원본 (집 PC 에 전달)
  판단간격초: number;       // 집 PC 화면 보기 간격
  참고글목록넣기: boolean;  // 공략 글 끝에 「참고한 글」
}
const 기본설정: 게임설정 = { 서버사진보관일: 30, 안쓴사진보관일: 60, 원본보관일: 30, 판단간격초: 2.5, 참고글목록넣기: true };

export function 게임설정읽기(): 게임설정 {
  const 저장 = json<Partial<게임설정>>(getSetting("game_settings"), {});
  const 환경 = Number(process.env.GAME_SHOT_KEEP_DAYS);
  return { ...기본설정, ...(환경 > 0 ? { 서버사진보관일: 환경 } : {}), ...저장 };
}

export function 게임설정저장(값: Partial<게임설정>): 게임설정 {
  const 숫자 = (v: unknown, 작: number, 큰: number, 원래: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(작, Math.min(큰, n)) : 원래;
  };
  const 원래 = 게임설정읽기();
  const 새것: 게임설정 = {
    서버사진보관일: 숫자(값.서버사진보관일, 1, 365, 원래.서버사진보관일),
    안쓴사진보관일: 숫자(값.안쓴사진보관일, 1, 365, 원래.안쓴사진보관일),
    원본보관일: 숫자(값.원본보관일, 1, 365, 원래.원본보관일),
    판단간격초: 숫자(값.판단간격초, 1, 10, 원래.판단간격초),
    참고글목록넣기: 값.참고글목록넣기 === undefined ? 원래.참고글목록넣기 : !!값.참고글목록넣기,
  };
  setSetting("game_settings", JSON.stringify(새것));
  return 새것;
}

// ── 집 PC 연결 토큰 ──────────────────────────────────────────
/**
 * 집 PC 가 드는 토큰. 배포 때 넣은 환경변수 GAME_AGENT_TOKEN 과, 대시보드 [설정 → 🔑 집 PC 연결] 에서
 * 만든 토큰(DB) **둘 다** 받는다. 대시보드에서 복사할 수 있어야 Cloud Shell 을 안 열고도 집 PC 를 붙인다.
 */
export function 에이전트토큰들(): string[] {
  return [(process.env.GAME_AGENT_TOKEN ?? "").trim(), (getSetting("game_agent_token") ?? "").trim()].filter((t) => t.length >= 16);
}

/** 화면에 보여 줄 토큰 — 대시보드에서 만든 것이 먼저, 없으면 환경변수 것. */
export function 보여줄토큰(): { token: string; from: "db" | "env" | null } {
  const db = (getSetting("game_agent_token") ?? "").trim();
  if (db.length >= 16) return { token: db, from: "db" };
  const env = (process.env.GAME_AGENT_TOKEN ?? "").trim();
  return env.length >= 16 ? { token: env, from: "env" } : { token: "", from: null };
}

export function 새토큰(): string {
  const t = crypto.randomBytes(24).toString("hex");
  setSetting("game_agent_token", t);
  return t;
}

// ── 프로필 ───────────────────────────────────────────────────
export function 프로필목록(): 게임프로필[] {
  const db = getDb();
  for (const p of 기본프로필들) {
    db.prepare("INSERT OR IGNORE INTO game_profiles (id, name, mode, profile_json) VALUES (?, ?, ?, ?)")
      .run(p.id, p.이름, p.모드, JSON.stringify(p));
  }
  return (db.prepare("SELECT profile_json FROM game_profiles ORDER BY rowid").all() as { profile_json: string }[])
    .map((r) => json<게임프로필 | null>(r.profile_json, null)).filter((p): p is 게임프로필 => !!p);
}

export function 프로필읽기(id: string): 게임프로필 | null {
  return 프로필목록().find((p) => p.id === id) ?? null;
}

export function 프로필저장(id: string, 값: Partial<게임프로필>): 게임프로필 | null {
  const 원래 = 프로필읽기(id);
  if (!원래) return null;
  const 새것 = 프로필다듬기(값, 원래);
  getDb().prepare("UPDATE game_profiles SET name = ?, mode = ?, profile_json = ?, updated_at = datetime('now') WHERE id = ?")
    .run(새것.이름, 새것.모드, JSON.stringify(새것), id);
  return 새것;
}

// ── 집 PC ────────────────────────────────────────────────────
export interface 에이전트행 {
  last_seen_at: string | null;
  agent_version: string | null;
  current_game: string | null;
  state: string | null;
  detail_json: string | null;
  pending_command: string | null;
  session_id: number | null;
}

function 에이전트줄(): 에이전트행 {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO game_agent (id) VALUES (1)").run();
  return db.prepare("SELECT * FROM game_agent WHERE id = 1").get() as 에이전트행;
}

export function 에이전트(): 에이전트행 & { detail: Record<string, unknown>; command: Record<string, unknown> | null } {
  const r = 에이전트줄();
  return { ...r, detail: json(r.detail_json, {}), command: json(r.pending_command, null) };
}

export function 하트비트적기(값: { version?: string; game?: string | null; state?: string; detail?: unknown }): void {
  에이전트줄();
  getDb().prepare(
    "UPDATE game_agent SET last_seen_at = ?, agent_version = ?, current_game = ?, state = ?, detail_json = ? WHERE id = 1",
  ).run(지금ISO(), String(값.version ?? "").slice(0, 20), 값.game ?? null, String(값.state ?? "대기").slice(0, 20),
    JSON.stringify(값.detail ?? {}));
}

export function 상태칸고치기(고칠것: Record<string, unknown>): void {
  const 지금 = 에이전트();
  getDb().prepare("UPDATE game_agent SET detail_json = ? WHERE id = 1").run(JSON.stringify({ ...지금.detail, ...고칠것 }));
}

/** 집 PC 에 줄 명령을 건다. `{명령:"start", game, mission_id}` 등 (15-4). */
export function 명령걸기(명령: Record<string, unknown> | null): void {
  에이전트줄();
  getDb().prepare("UPDATE game_agent SET pending_command = ? WHERE id = 1").run(명령 ? JSON.stringify({ ...명령, at: 지금ISO() }) : null);
}

/** 집 PC 가 가져가면 비운다 — 같은 명령을 두 번 하지 않게. */
export function 명령가져가기(): Record<string, unknown> | null {
  const { command } = 에이전트();
  if (command) 명령걸기(null);
  return command;
}

export function 세션적기(sessionId: number | null): void {
  에이전트줄();
  getDb().prepare("UPDATE game_agent SET session_id = ? WHERE id = 1").run(sessionId);
}

// ── 세션·사용 시간 ───────────────────────────────────────────
export interface 세션 { id: number; game_id: string; mission_id: number | null; started_at: string; ended_at: string | null; end_reason: string | null; minutes_used: number }

export function 세션시작(gameId: string, missionId: number | null): 세션 {
  const r = getDb().prepare("INSERT INTO game_sessions (game_id, mission_id, started_at) VALUES (?, ?, ?)").run(gameId, missionId, 지금ISO());
  세션적기(Number(r.lastInsertRowid));
  return 세션읽기(Number(r.lastInsertRowid))!;
}

export function 세션읽기(id: number): 세션 | null {
  return (getDb().prepare("SELECT * FROM game_sessions WHERE id = ?").get(id) as 세션 | undefined) ?? null;
}

export function 열린세션(): 세션 | null {
  const { session_id } = 에이전트줄();
  const s = session_id ? 세션읽기(session_id) : null;
  return s && !s.ended_at ? s : null;
}

function 분(s: 세션, 지금 = Date.now()): number {
  const 끝 = s.ended_at ? Date.parse(s.ended_at) : 지금;
  return Math.max(0, (끝 - Date.parse(s.started_at)) / 60_000);
}

export function 세션끝(id: number, 까닭: string): void {
  const s = 세션읽기(id);
  if (!s || s.ended_at) return;
  const 끝 = 지금ISO();
  getDb().prepare("UPDATE game_sessions SET ended_at = ?, end_reason = ?, minutes_used = ? WHERE id = ?")
    .run(끝, 까닭.slice(0, 120), 분({ ...s, ended_at: 끝 }), id);
  if (에이전트줄().session_id === id) 세션적기(null);
}

/** 오늘(서버 시간대) 쓴 분 — 게임을 정하면 그 게임만. */
export function 오늘사용분(gameId?: string): number {
  const 오늘시작 = DateTime.now().setZone(config.timezone).startOf("day").toUTC().toISO()!;
  const 줄들 = getDb().prepare("SELECT * FROM game_sessions WHERE (ended_at IS NULL OR ended_at >= ?)").all(오늘시작) as 세션[];
  const 기준 = Date.parse(오늘시작);
  return 줄들.filter((s) => !gameId || s.game_id === gameId).reduce((합, s) => {
    const 시작 = Math.max(Date.parse(s.started_at), 기준);
    const 끝 = s.ended_at ? Date.parse(s.ended_at) : Date.now();
    return 합 + Math.max(0, (끝 - 시작) / 60_000);
  }, 0);
}

// ── 기록 ─────────────────────────────────────────────────────
export function 기록(kind: string, detail: unknown = {}, gameId: string | null = null): void {
  getDb().prepare("INSERT INTO game_play_log (session_id, game_id, at, kind, detail_json) VALUES (?, ?, ?, ?, ?)")
    .run(열린세션()?.id ?? null, gameId, 지금ISO(), kind.slice(0, 30), JSON.stringify(detail));
}

export function 최근기록(n = 20, gameId?: string): { id: number; at: string; kind: string; game_id: string | null; detail: Record<string, unknown> }[] {
  const 줄들 = (gameId
    ? getDb().prepare("SELECT * FROM game_play_log WHERE game_id = ? ORDER BY id DESC LIMIT ?").all(gameId, n)
    : getDb().prepare("SELECT * FROM game_play_log ORDER BY id DESC LIMIT ?").all(n)) as { id: number; at: string; kind: string; game_id: string | null; detail_json: string }[];
  return 줄들.map((r) => ({ id: r.id, at: r.at, kind: r.kind, game_id: r.game_id, detail: json(r.detail_json, {}) }));
}

// ── 퀘스트 ───────────────────────────────────────────────────
export interface 퀘스트 {
  id: number; game_id: string; name: string; kind: string; status: string; stuck_reason: string | null;
  last_shot_id: number | null; checklist_json: string | null; shot_order_json: string | null;
  ref_links_json: string | null; ref_brief: string | null; ref_brief_at: string | null;
  first_seen_at: string; done_at: string | null; post_id: number | null;
}

export function 퀘스트읽기(id: number): 퀘스트 | null {
  return (getDb().prepare("SELECT * FROM game_quests WHERE id = ?").get(id) as 퀘스트 | undefined) ?? null;
}

export function 퀘스트찾거나만들기(gameId: string, 이름: string, 종류: string): { 퀘스트: 퀘스트; 새것: boolean } {
  const 있던것 = getDb().prepare("SELECT * FROM game_quests WHERE game_id = ? AND name = ?").get(gameId, 이름) as 퀘스트 | undefined;
  if (있던것) {
    if (종류 !== "기타" && 있던것.kind === "기타") getDb().prepare("UPDATE game_quests SET kind = ? WHERE id = ?").run(종류, 있던것.id);
    return { 퀘스트: 퀘스트읽기(있던것.id)!, 새것: false };
  }
  const r = getDb().prepare("INSERT INTO game_quests (game_id, name, kind, first_seen_at) VALUES (?, ?, ?, ?)").run(gameId, 이름, 종류, 지금ISO());
  return { 퀘스트: 퀘스트읽기(Number(r.lastInsertRowid))!, 새것: true };
}

export function 퀘스트목록(gameId: string, 상태?: string): 퀘스트[] {
  return (상태
    ? getDb().prepare("SELECT * FROM game_quests WHERE game_id = ? AND status = ? ORDER BY first_seen_at DESC").all(gameId, 상태)
    : getDb().prepare("SELECT * FROM game_quests WHERE game_id = ? ORDER BY first_seen_at DESC").all(gameId)) as 퀘스트[];
}

export function 퀘스트고치기(id: number, 값: Partial<Pick<퀘스트, "status" | "stuck_reason" | "last_shot_id" | "checklist_json" | "shot_order_json" | "ref_links_json" | "ref_brief" | "ref_brief_at" | "done_at" | "post_id" | "kind">>): void {
  const 칸 = Object.keys(값);
  if (!칸.length) return;
  getDb().prepare(`UPDATE game_quests SET ${칸.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
    .run(...칸.map((k) => (값 as Record<string, unknown>)[k] ?? null), id);
}

/** 퀘스트의 체크리스트 상태 — 뺀 사진은 세지 않는다. */
export function 진행표(q: 퀘스트) {
  const 장면들 = (getDb().prepare("SELECT scene FROM game_shots WHERE quest_id = ? AND removed = 0 AND deleted_at IS NULL").all(q.id) as { scene: string }[]).map((r) => r.scene);
  return { ...채우기(칸들(json<칸고름[] | null>(q.checklist_json, null), q.kind), 장면들), 사진수: 장면들.length };
}

// ── 사진 ─────────────────────────────────────────────────────
export interface 사진 {
  id: number; game_id: string; session_id: number | null; quest_id: number | null; scene: string; caption: string | null;
  source: string; gcs_path: string; width: number | null; height: number | null; taken_at: string;
  used_in_post: number; removed: number; deleted_at: string | null;
}

export function 사진기록넣기(값: { gameId: string; questId: number | null; scene: string; caption: string; source: string; width?: number; height?: number; takenAt?: string }): number {
  const r = getDb().prepare(
    "INSERT INTO game_shots (game_id, session_id, quest_id, scene, caption, source, gcs_path, width, height, taken_at) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)",
  ).run(값.gameId, 열린세션()?.id ?? null, 값.questId, 값.scene, 값.caption.slice(0, 120), 값.source, 값.width ?? null, 값.height ?? null, 값.takenAt ?? 지금ISO());
  return Number(r.lastInsertRowid);
}

export function 사진경로적기(id: number, 경로: string): void {
  getDb().prepare("UPDATE game_shots SET gcs_path = ? WHERE id = ?").run(경로, id);
}

export function 사진읽기(id: number): 사진 | null {
  return (getDb().prepare("SELECT * FROM game_shots WHERE id = ?").get(id) as 사진 | undefined) ?? null;
}

export function 사진지움표시(id: number): void {
  getDb().prepare("UPDATE game_shots SET deleted_at = ? WHERE id = ?").run(지금ISO(), id);
}

export function 사진고치기(id: number, 값: { removed?: boolean; questId?: number | null; scene?: string; caption?: string }): void {
  const s = 사진읽기(id);
  if (!s) return;
  getDb().prepare("UPDATE game_shots SET removed = ?, quest_id = ?, scene = ?, caption = ? WHERE id = ?").run(
    값.removed === undefined ? s.removed : 값.removed ? 1 : 0,
    값.questId === undefined ? s.quest_id : 값.questId,
    값.scene ?? s.scene, (값.caption ?? s.caption ?? "").slice(0, 120), id);
}

/** 퀘스트 앨범 — 사람이 정한 순서가 있으면 그 순서, 없으면 찍은 순서. */
export function 퀘스트사진들(q: 퀘스트, 뺀것도 = true): 사진[] {
  const 다 = getDb().prepare("SELECT * FROM game_shots WHERE quest_id = ? AND deleted_at IS NULL ORDER BY taken_at, id").all(q.id) as 사진[];
  const 순서 = json<number[]>(q.shot_order_json, []);
  const 자리 = (id: number) => { const i = 순서.indexOf(id); return i < 0 ? 1e6 + id : i; };
  const 정렬 = 순서.length ? [...다].sort((a, b) => 자리(a.id) - 자리(b.id)) : 다;
  return 뺀것도 ? 정렬 : 정렬.filter((s) => !s.removed);
}

export function 최근사진들(n = 8, gameId?: string): 사진[] {
  return (gameId
    ? getDb().prepare("SELECT * FROM game_shots WHERE game_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?").all(gameId, n)
    : getDb().prepare("SELECT * FROM game_shots WHERE deleted_at IS NULL ORDER BY id DESC LIMIT ?").all(n)) as 사진[];
}

export const 한쪽 = 8;

/** 캡처 고르기 창 — 한 쪽 8장 고정 (15-8). */
export function 사진찾기(거름: { game?: string; quest?: number; scene?: string; q?: string; unused?: boolean; page?: number }) {
  const 조건: string[] = ["deleted_at IS NULL", "removed = 0", "source != 'list'"];
  const 값: unknown[] = [];
  if (거름.game) { 조건.push("game_id = ?"); 값.push(거름.game); }
  if (거름.quest) { 조건.push("quest_id = ?"); 값.push(거름.quest); }
  if (거름.scene) { 조건.push("scene = ?"); 값.push(거름.scene); }
  if (거름.q) { 조건.push("caption LIKE ?"); 값.push(`%${거름.q}%`); }
  if (거름.unused) 조건.push("id NOT IN (SELECT shot_id FROM post_game_shots)");
  const 어디 = 조건.join(" AND ");
  const total = (getDb().prepare(`SELECT count(*) AS n FROM game_shots WHERE ${어디}`).get(...값) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / 한쪽));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(거름.page) || 1)));
  const items = getDb().prepare(`SELECT * FROM game_shots WHERE ${어디} ORDER BY taken_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...값, 한쪽, (page - 1) * 한쪽) as 사진[];
  return { items, page, total, pages };
}

// ── 글에 쓴 캡처 (15-8) ──────────────────────────────────────
export function 글사진들(postId: number): 사진[] {
  return getDb().prepare(
    "SELECT s.* FROM post_game_shots p JOIN game_shots s ON s.id = p.shot_id WHERE p.post_id = ? ORDER BY p.sort",
  ).all(postId) as 사진[];
}

export function 글사진적기(postId: number, shotIds: number[], 방식: "replace" | "append"): void {
  const db = getDb();
  db.transaction(() => {
    if (방식 === "replace") db.prepare("DELETE FROM post_game_shots WHERE post_id = ?").run(postId);
    const 시작 = (db.prepare("SELECT coalesce(max(sort), -1) AS m FROM post_game_shots WHERE post_id = ?").get(postId) as { m: number }).m + 1;
    shotIds.forEach((id, i) => {
      db.prepare("INSERT OR IGNORE INTO post_game_shots (post_id, shot_id, sort) VALUES (?, ?, ?)").run(postId, id, 시작 + i);
      db.prepare("UPDATE game_shots SET used_in_post = 1 WHERE id = ?").run(id);
    });
  })();
}

export function 글사진빼기(postId: number, shotId: number): void {
  getDb().prepare("DELETE FROM post_game_shots WHERE post_id = ? AND shot_id = ?").run(postId, shotId);
}

// ── 미션 ─────────────────────────────────────────────────────
export interface 미션 {
  id: number; game_id: string; title: string; quest_id: number | null; targets_json: string;
  checklist_json: string | null; progress_json: string; status: string; created_at: string;
}
export interface 목표 { 종류: string; 개수?: number; 퀘스트?: string }

export function 미션목록(gameId?: string): 미션[] {
  return (gameId
    ? getDb().prepare("SELECT * FROM game_missions WHERE game_id = ? ORDER BY id DESC").all(gameId)
    : getDb().prepare("SELECT * FROM game_missions ORDER BY id DESC").all()) as 미션[];
}

export function 미션읽기(id: number): 미션 | null {
  return (getDb().prepare("SELECT * FROM game_missions WHERE id = ?").get(id) as 미션 | undefined) ?? null;
}

export function 미션저장(id: number | null, 값: { game_id: string; title: string; targets: 목표[]; checklist: 칸고름[] | null; status?: string }): 미션 {
  const db = getDb();
  if (id) {
    db.prepare("UPDATE game_missions SET game_id = ?, title = ?, targets_json = ?, checklist_json = ?, status = coalesce(?, status) WHERE id = ?")
      .run(값.game_id, 값.title, JSON.stringify(값.targets), 값.checklist ? JSON.stringify(값.checklist) : null, 값.status ?? null, id);
    return 미션읽기(id)!;
  }
  const r = db.prepare("INSERT INTO game_missions (game_id, title, targets_json, checklist_json, status) VALUES (?, ?, ?, ?, ?)")
    .run(값.game_id, 값.title, JSON.stringify(값.targets), 값.checklist ? JSON.stringify(값.checklist) : null, 값.status ?? "대기");
  return 미션읽기(Number(r.lastInsertRowid))!;
}

export function 미션고치기(id: number, 값: { status?: string; progress?: unknown }): void {
  const m = 미션읽기(id);
  if (!m) return;
  getDb().prepare("UPDATE game_missions SET status = ?, progress_json = ? WHERE id = ?")
    .run(값.status ?? m.status, 값.progress === undefined ? m.progress_json : JSON.stringify(값.progress), id);
}

export function 미션지우기(id: number): boolean {
  return getDb().prepare("DELETE FROM game_missions WHERE id = ?").run(id).changes > 0;
}

export function 미션목표들(m: 미션): 목표[] { return json<목표[]>(m.targets_json, []); }
export function 미션진행(m: 미션): { quest_ids: number[] } { return { quest_ids: [], ...json<{ quest_ids?: number[] }>(m.progress_json, {}) } as { quest_ids: number[] }; }
export function 미션칸고름(m: 미션): 칸고름[] | null { return json<칸고름[] | null>(m.checklist_json, null); }

// ── 게임 미션 목록 (15-6) ────────────────────────────────────
export interface 목록행 {
  id: number; game_id: string; name: string; kind: string; status: string; condition_text: string | null;
  game_order: number; sort_key: number; confidence: number; verified: number; evidence_shot_ids: string;
  quest_id: number | null; seen_at: string; updated_at: string;
}

export function 목록줄들(gameId: string): 목록행[] {
  return getDb().prepare("SELECT * FROM game_quest_list WHERE game_id = ? ORDER BY sort_key, game_order, id").all(gameId) as 목록행[];
}

export function 목록줄읽기(id: number): 목록행 | null {
  return (getDb().prepare("SELECT * FROM game_quest_list WHERE id = ?").get(id) as 목록행 | undefined) ?? null;
}

export function 목록줄넣기(gameId: string, 값: { name: string; kind: string; status: string; condition: string; order: number; sortKey: number; confidence: number; evidence: number[] }): void {
  const db = getDb();
  const 있던것 = db.prepare("SELECT * FROM game_quest_list WHERE game_id = ? AND name = ?").get(gameId, 값.name) as 목록행 | undefined;
  if (있던것?.verified) {
    // 사람이 확인한 줄은 덮어쓰지 않는다. 순서·근거만 새로.
    db.prepare("UPDATE game_quest_list SET game_order = ?, seen_at = ?, evidence_shot_ids = ? WHERE id = ?")
      .run(값.order, 지금ISO(), JSON.stringify([...new Set([...json<number[]>(있던것.evidence_shot_ids, []), ...값.evidence])]), 있던것.id);
    return;
  }
  if (있던것) {
    db.prepare("UPDATE game_quest_list SET kind = ?, status = ?, condition_text = ?, game_order = ?, sort_key = ?, confidence = ?, evidence_shot_ids = ?, seen_at = ?, updated_at = ? WHERE id = ?")
      .run(값.kind, 값.status, 값.condition, 값.order, 값.sortKey, 값.confidence, JSON.stringify(값.evidence), 지금ISO(), 지금ISO(), 있던것.id);
    return;
  }
  db.prepare("INSERT INTO game_quest_list (game_id, name, kind, status, condition_text, game_order, sort_key, confidence, evidence_shot_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(gameId, 값.name, 값.kind, 값.status, 값.condition, 값.order, 값.sortKey, 값.confidence, JSON.stringify(값.evidence));
}

export function 목록줄고치기(id: number, 값: { name?: string; kind?: string; status?: string; condition?: string; verified?: boolean; sortKey?: number; evidenceAdd?: number; questId?: number | null }): void {
  const r = 목록줄읽기(id);
  if (!r) return;
  const 근거 = json<number[]>(r.evidence_shot_ids, []);
  if (값.evidenceAdd && !근거.includes(값.evidenceAdd)) 근거.push(값.evidenceAdd);
  getDb().prepare("UPDATE game_quest_list SET name = ?, kind = ?, status = ?, condition_text = ?, verified = ?, sort_key = ?, evidence_shot_ids = ?, quest_id = ?, updated_at = ? WHERE id = ?")
    .run(값.name ?? r.name, 값.kind ?? r.kind, 값.status ?? r.status, 값.condition ?? r.condition_text, 값.verified === undefined ? r.verified : 값.verified ? 1 : 0,
      값.sortKey ?? r.sort_key, JSON.stringify(근거), 값.questId === undefined ? r.quest_id : 값.questId, 지금ISO(), id);
}

// ── 자동 정리 (7-5) ──────────────────────────────────────────
/**
 * 지울 사진 — 이 캡처를 쓴 **모든** 글이 발행 후 N일 지났을 때만(15-8).
 * 아직 발행 안 한 글이 하나라도 쓰면 남긴다. 어떤 글에도 안 쓴 사진은 찍은 지 M일 지나면.
 * 퀘스트 공략 글(game_quest_id)에 들어간 사진도 «쓴 것» 으로 본다.
 */
export function 지울사진들(발행후일: number, 안쓴일: number, 지금 = new Date()): 사진[] {
  const 발행기준 = new Date(지금.getTime() - 발행후일 * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const 안쓴기준 = new Date(지금.getTime() - 안쓴일 * 86_400_000).toISOString();
  return getDb().prepare(`
    SELECT s.* FROM game_shots s
    WHERE s.deleted_at IS NULL AND (
      ( EXISTS (SELECT 1 FROM 쓴글 u WHERE u.shot_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM 쓴글 u JOIN posts p ON p.id = u.post_id
                        WHERE u.shot_id = s.id AND (p.status != 'published' OR p.published_at IS NULL OR p.published_at > ?)) )
      OR ( NOT EXISTS (SELECT 1 FROM 쓴글 u WHERE u.shot_id = s.id) AND s.taken_at < ? )
    )`.replace(/쓴글/g, `(SELECT post_id, shot_id FROM post_game_shots
                          UNION SELECT p.id AS post_id, gs.id AS shot_id FROM posts p JOIN game_shots gs ON gs.quest_id = p.game_quest_id
                          WHERE p.source = 'game' AND gs.removed = 0)`),
  ).all(발행기준, 안쓴기준) as 사진[];
}

export function 오래된기록지우기(일 = 7): number {
  const 기준 = new Date(Date.now() - 일 * 86_400_000).toISOString();
  return getDb().prepare("DELETE FROM game_play_log WHERE at < ?").run(기준).changes;
}
