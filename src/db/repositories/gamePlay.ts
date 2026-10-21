/**
 * 🕹️ 게임 스샷 저장소 (017 표를 그대로 쓴다). **주인 자리 전용**이라 owner_key 로 거르지 않는다 —
 * 라우트(`routes/game.ts`)가 관리자가 아니면 404 로 막는다.
 * (🎮 출시 달력은 `gameEvents.ts` — 이름이 비슷하지만 다른 것)
 *
 * 2026-10-21 개편: 자동 진행·미션·퀘스트·화면 판단을 걷어 냈다. 남은 일은
 * 게임 목록 · 단축키로 찍은 스샷 · 글에 붙인 스샷 · 오래된 스샷 정리 뿐이다.
 * 예전 표(game_sessions·game_quests·game_missions·game_play_log·game_quest_list)는 지우지 않고 안 쓴다.
 */
import crypto from "node:crypto";
import { DateTime } from "luxon";
import { getDb } from "../index.js";
import { getSetting, setSetting } from "./settings.js";
import { config } from "../../config.js";
import { 기본게임들, 게임다듬기, type 게임 } from "../../game/프로필.js";

const 지금ISO = () => new Date().toISOString();
const json = <T>(글: string | null | undefined, 없으면: T): T => {
  try { return 글 ? (JSON.parse(글) as T) : 없으면; } catch { return 없으면; }
};

// ── 설정 ─────────────────────────────────────────────────────
/** 집 PC 단축키로 고를 수 있는 키 — 집 PC 의 keyboard 라이브러리 이름과 맞춘다 */
export const 단축키들 = ["F6", "F7", "F8", "F9", "F10", "F11", "Print Screen"] as const;

export interface 게임설정 {
  단축키: string;
  서버사진보관일: number;   // 발행한 글에 쓴 사진 — 발행 후 이 날수가 지나면 지움
  안쓴사진보관일: number;   // 어떤 글에도 안 쓴 사진
  원본보관일: number;       // 집 PC 원본 (집 PC 에 전달)
}
const 기본설정: 게임설정 = { 단축키: "F9", 서버사진보관일: 30, 안쓴사진보관일: 60, 원본보관일: 30 };

export function 게임설정읽기(): 게임설정 {
  const 저장 = json<Partial<게임설정>>(getSetting("game_settings"), {});
  const 환경 = Number(process.env.GAME_SHOT_KEEP_DAYS);
  const 값 = { ...기본설정, ...(환경 > 0 ? { 서버사진보관일: 환경 } : {}), ...저장 };
  return {
    단축키: (단축키들 as readonly string[]).includes(값.단축키) ? 값.단축키 : 기본설정.단축키,
    서버사진보관일: 값.서버사진보관일, 안쓴사진보관일: 값.안쓴사진보관일, 원본보관일: 값.원본보관일,
  };
}

export function 게임설정저장(값: Partial<게임설정>): 게임설정 {
  const 숫자 = (v: unknown, 작: number, 큰: number, 원래: number) => {
    const n = Number(v);
    return v !== undefined && Number.isFinite(n) ? Math.max(작, Math.min(큰, Math.round(n))) : 원래;
  };
  const 원래 = 게임설정읽기();
  const 새것: 게임설정 = {
    단축키: 값.단축키 && (단축키들 as readonly string[]).includes(값.단축키) ? 값.단축키 : 원래.단축키,
    서버사진보관일: 숫자(값.서버사진보관일, 1, 365, 원래.서버사진보관일),
    안쓴사진보관일: 숫자(값.안쓴사진보관일, 1, 365, 원래.안쓴사진보관일),
    원본보관일: 숫자(값.원본보관일, 1, 365, 원래.원본보관일),
  };
  setSetting("game_settings", JSON.stringify(새것));
  return 새것;
}

// ── 집 PC 연결 토큰 ──────────────────────────────────────────
/**
 * 집 PC 가 드는 토큰. 배포 때 넣은 환경변수 GAME_AGENT_TOKEN 과, 대시보드 [설정 → 🔑 집 PC 연결] 에서
 * 만든 토큰(DB) **둘 다** 받는다.
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

// ── 게임 목록 ────────────────────────────────────────────────
export function 게임목록(): 게임[] {
  const db = getDb();
  for (const g of 기본게임들) {
    db.prepare("INSERT OR IGNORE INTO game_profiles (id, name, mode, profile_json) VALUES (?, ?, '기록', ?)")
      .run(g.id, g.이름, JSON.stringify(g));
  }
  return (db.prepare("SELECT id, name, profile_json FROM game_profiles ORDER BY rowid").all() as { id: string; name: string; profile_json: string }[])
    .map((r) => 게임다듬기({ 이름: r.name, ...json<Partial<게임>>(r.profile_json, {}) }, { id: r.id, 이름: r.name, 창제목: "" }));
}

export function 게임읽기(id: string): 게임 | null {
  return 게임목록().find((g) => g.id === id) ?? null;
}

export function 게임추가(값: Partial<게임>): 게임 {
  const g = 게임다듬기(값, { id: `g${Date.now().toString(36)}`, 이름: "", 창제목: "" });
  getDb().prepare("INSERT INTO game_profiles (id, name, mode, profile_json) VALUES (?, ?, '기록', ?)").run(g.id, g.이름, JSON.stringify(g));
  return g;
}

export function 게임고치기(id: string, 값: Partial<게임>): 게임 | null {
  const 원래 = 게임읽기(id);
  if (!원래) return null;
  const g = 게임다듬기(값, 원래);
  getDb().prepare("UPDATE game_profiles SET name = ?, profile_json = ?, updated_at = datetime('now') WHERE id = ?").run(g.이름, JSON.stringify(g), id);
  return g;
}

// ── 집 PC 연결 ───────────────────────────────────────────────
export function 에이전트(): { last_seen_at: string | null; agent_version: string | null } {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO game_agent (id) VALUES (1)").run();
  return db.prepare("SELECT last_seen_at, agent_version FROM game_agent WHERE id = 1").get() as { last_seen_at: string | null; agent_version: string | null };
}

export function 하트비트적기(version: unknown): void {
  에이전트();
  getDb().prepare("UPDATE game_agent SET last_seen_at = ?, agent_version = ?, state = '대기' WHERE id = 1").run(지금ISO(), String(version ?? "").slice(0, 20));
}

// ── 스샷 ─────────────────────────────────────────────────────
export interface 사진 {
  id: number; game_id: string; caption: string | null; source: string; gcs_path: string;
  width: number | null; height: number | null; taken_at: string; used_in_post: number; removed: number;
  deleted_at: string | null; window_title: string | null;
}

/** 받은 시각을 UTC ISO 로 맞춘다 — 날짜로 거를 때 글자 비교가 맞게. */
function 시각맞추기(값?: string): string {
  const t = 값 ? Date.parse(값) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : 지금ISO();
}

export function 사진기록넣기(값: { gameId: string; source: string; caption?: string; windowTitle?: string; width?: number; height?: number; takenAt?: string }): number {
  const r = getDb().prepare(
    "INSERT INTO game_shots (game_id, scene, caption, source, gcs_path, width, height, taken_at, window_title) VALUES (?, '기타', ?, ?, '', ?, ?, ?, ?)",
  ).run(값.gameId, (값.caption ?? "").slice(0, 120), 값.source, 값.width ?? null, 값.height ?? null, 시각맞추기(값.takenAt), (값.windowTitle ?? "").slice(0, 120) || null);
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

export function 사진고치기(id: number, 값: { caption?: string; gameId?: string }): void {
  const s = 사진읽기(id);
  if (!s) return;
  getDb().prepare("UPDATE game_shots SET caption = ?, game_id = ? WHERE id = ?")
    .run((값.caption ?? s.caption ?? "").slice(0, 120), 값.gameId ?? s.game_id, id);
}

/** «기타» 스샷 중 창 제목에 이 말이 들어간 것을 새 게임으로 옮긴다. */
export function 기타옮기기(창제목: string, gameId: string): number {
  if (!창제목) return 0;
  return getDb().prepare("UPDATE game_shots SET game_id = ? WHERE game_id = 'etc' AND deleted_at IS NULL AND lower(window_title) LIKE ?")
    .run(gameId, `%${창제목.toLowerCase()}%`).changes;
}

export type 날짜 = "today" | "yesterday" | "7d" | "all";

/** [시작, 끝) — UTC ISO. 서버 시간대(config.timezone) 기준 하루. */
function 날짜범위(날: 날짜): [string | null, string | null] {
  const 오늘 = DateTime.now().setZone(config.timezone).startOf("day");
  const iso = (d: DateTime) => d.toUTC().toISO()!;
  if (날 === "today") return [iso(오늘), null];
  if (날 === "yesterday") return [iso(오늘.minus({ days: 1 })), iso(오늘)];
  if (날 === "7d") return [iso(오늘.minus({ days: 6 })), null];
  return [null, null];
}

const 살아있는 = "deleted_at IS NULL AND removed = 0 AND source != 'list'";

/** 앨범·고르기 창 — 최근 것부터. 쪽 크기는 고르기 창 8장, 앨범 48장. */
export function 사진찾기(거름: { game?: string; day?: 날짜; unused?: boolean; page?: number; size?: number }) {
  const 조건: string[] = [살아있는];
  const 값: unknown[] = [];
  if (거름.game) { 조건.push("game_id = ?"); 값.push(거름.game); }
  const [시작, 끝] = 날짜범위(거름.day ?? "all");
  if (시작) { 조건.push("taken_at >= ?"); 값.push(시작); }
  if (끝) { 조건.push("taken_at < ?"); 값.push(끝); }
  if (거름.unused) 조건.push("id NOT IN (SELECT shot_id FROM post_game_shots)");
  const 어디 = 조건.join(" AND ");
  const 쪽 = Math.max(1, Math.min(96, Math.floor(Number(거름.size) || 8)));
  const total = (getDb().prepare(`SELECT count(*) AS n FROM game_shots WHERE ${어디}`).get(...값) as { n: number }).n;
  const pages = Math.max(1, Math.ceil(total / 쪽));
  const page = Math.max(1, Math.min(pages, Math.floor(Number(거름.page) || 1)));
  const items = getDb().prepare(`SELECT * FROM game_shots WHERE ${어디} ORDER BY taken_at DESC, id DESC LIMIT ? OFFSET ?`)
    .all(...값, 쪽, (page - 1) * 쪽) as 사진[];
  return { items, page, total, pages };
}

/** 게임마다 전체·오늘·어제·7일 장수 */
export function 사진수들(): Record<string, { 전체: number; 오늘: number; 어제: number; 칠일: number }> {
  const [오늘] = 날짜범위("today");
  const [어제] = 날짜범위("yesterday");
  const [칠일] = 날짜범위("7d");
  const 줄들 = getDb().prepare(`
    SELECT game_id, count(*) AS 전체,
      sum(taken_at >= ?) AS 오늘, sum(taken_at >= ? AND taken_at < ?) AS 어제, sum(taken_at >= ?) AS 칠일
    FROM game_shots WHERE ${살아있는} GROUP BY game_id`).all(오늘, 어제, 오늘, 칠일) as { game_id: string; 전체: number; 오늘: number; 어제: number; 칠일: number }[];
  return Object.fromEntries(줄들.map((r) => [r.game_id, { 전체: r.전체, 오늘: r.오늘 ?? 0, 어제: r.어제 ?? 0, 칠일: r.칠일 ?? 0 }]));
}

export function 마지막사진(): 사진 | null {
  return (getDb().prepare(`SELECT * FROM game_shots WHERE ${살아있는} ORDER BY id DESC LIMIT 1`).get() as 사진 | undefined) ?? null;
}

/** 글에 자동으로 붙일 후보 — 그 게임에서 **아직 어떤 글에도 안 쓴** 최근 스샷부터. */
export function 안쓴최근사진들(gameId: string, 몇: number, 뺄것: number[] = []): 사진[] {
  return (getDb().prepare(`
    SELECT * FROM game_shots WHERE game_id = ? AND ${살아있는}
      AND id NOT IN (SELECT shot_id FROM post_game_shots)
    ORDER BY taken_at DESC, id DESC LIMIT ?`).all(gameId, 몇 + 뺄것.length) as 사진[])
    .filter((s) => !뺄것.includes(s.id)).slice(0, 몇);
}

// ── 글에 쓴 스샷 ─────────────────────────────────────────────
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

// ── 자동 정리 ────────────────────────────────────────────────
/**
 * 지울 사진 — 이 스샷을 쓴 **모든** 글이 발행 후 N일 지났을 때만.
 * 아직 발행 안 한 글이 하나라도 쓰면 남긴다. 어떤 글에도 안 쓴 사진은 찍은 지 M일 지나면.
 */
export function 지울사진들(발행후일: number, 안쓴일: number, 지금 = new Date()): 사진[] {
  const 발행기준 = new Date(지금.getTime() - 발행후일 * 86_400_000).toISOString().replace("T", " ").slice(0, 19);
  const 안쓴기준 = new Date(지금.getTime() - 안쓴일 * 86_400_000).toISOString();
  return getDb().prepare(`
    SELECT s.* FROM game_shots s
    WHERE s.deleted_at IS NULL AND (
      ( EXISTS (SELECT 1 FROM post_game_shots u WHERE u.shot_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM post_game_shots u JOIN posts p ON p.id = u.post_id
                        WHERE u.shot_id = s.id AND (p.status != 'published' OR p.published_at IS NULL OR p.published_at > ?)) )
      OR ( NOT EXISTS (SELECT 1 FROM post_game_shots u WHERE u.shot_id = s.id) AND s.taken_at < ? )
    )`).all(발행기준, 안쓴기준) as 사진[];
}
