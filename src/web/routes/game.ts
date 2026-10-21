/**
 * 🕹️ 게임 플레이 API (GAME_PLAN 7-3·15번). **주인 자리 전용** — 체험·판매 키에는 404.
 *
 * 집 PC 전용 (헤더 `x-game-agent-token` = 환경변수 GAME_AGENT_TOKEN, 대시보드 토큰과 따로):
 *   POST /api/game/agent/heartbeat   5초마다. 상태를 적고 명령(start·stop·capture·sync_list)을 받아 간다
 *   POST /api/game/agent/judge       화면이 바뀐 순간의 작은 사진 → 판단 JSON (사진은 저장 안 함)
 *   POST /api/game/agent/shot        남길 사진(WebP 1280) → { shot_id }
 *   POST /api/game/agent/list        게임 목록 창 사진들 → 한 줄씩 읽어 저장 (15-6)
 *   POST /api/game/agent/event       막힘·사망·세션 끝 같은 이벤트
 *   GET  /api/game/agent/profile/:id 프로필 (서버 쪽이 원본)
 *
 * 사진은 multipart 대신 JSON 안의 base64 로 받는다. 따로 플러그인을 넣지 않아도 되고,
 * 판단용 사진(768px)·남길 사진(1280px)은 한 장에 수백 KB 라 이 길이 단순하다.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import sharp from "sharp";
import { 관리자인가 } from "../../tenancy.js";
import { getPost } from "../../db/repositories/posts.js";
import { getCategory } from "../../db/repositories/categories.js";
import {
  게임설정읽기, 게임설정저장, 프로필목록, 프로필읽기, 프로필저장, 에이전트, 하트비트적기, 상태칸고치기, 명령걸기, 명령가져가기,
  세션시작, 세션끝, 열린세션, 오늘사용분, 기록, 최근기록, 퀘스트읽기, 퀘스트목록, 퀘스트고치기, 진행표, 사진기록넣기,
  사진경로적기, 사진읽기 as 사진행읽기, 사진고치기, 퀘스트사진들, 최근사진들, 사진찾기, 글사진들, 글사진빼기,
  미션목록, 미션읽기, 미션저장, 미션지우기, 미션목표들, 미션칸고름, 목록줄들, 목록줄읽기, 목록줄넣기, 목록줄고치기,
  type 사진, type 퀘스트, type 목표,
} from "../../db/repositories/gamePlay.js";
import { 지금저장통, 저장통안내, 사진경로, 사진넣기, 사진읽기, 서명주소 } from "../../game/사진저장.js";
import { 판단하기 } from "../../game/판단.js";
import { 판단반영, 사진반영, 막힘반영, 사람이완료, 미션요약하기, 미션확인, 지금퀘스트, 글준비수 } from "../../game/진행.js";
import { 칸목록, 칸들, 장면들, 빠진것, type 칸고름 } from "../../game/미션.js";
import { 목록사진읽기, 정렬값 } from "../../game/목록.js";
import { 주소다듬기, 참고글찾기 } from "../../game/참고글.js";
import { generateGamePost, 캡처를글에 } from "../../pipeline/generateGamePost.js";
import { pickGameShots } from "../../game/캡처고르기.js";

const 큰몸 = { bodyLimit: 25 * 1024 * 1024 };
/** 하트비트가 이보다 오래 없으면 «연결 끊김». 집 PC 는 5초마다 온다. */
const 끊김초 = 20;

function 사진풀기(b64: unknown): Buffer {
  const 글 = String(b64 ?? "").replace(/^data:[^,]+,/, "");
  if (!글) throw Object.assign(new Error("사진이 비어 있습니다."), { statusCode: 400 });
  return Buffer.from(글, "base64");
}

async function webp(원본: Buffer, 폭: number): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(원본).rotate().resize({ width: 폭, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** 사진 한 장 저장 — 기록 → 저장통 → 경로. */
async function 사진저장하기(gameId: string, 원본: Buffer, 메타: { questId: number | null; scene: string; caption: string; source: string; takenAt?: string }): Promise<사진> {
  const { data, width, height } = await webp(원본, 1280);
  const id = 사진기록넣기({ gameId, ...메타, width, height });
  const 경로 = 사진경로(gameId, id);
  await 사진넣기(경로, data);
  사진경로적기(id, 경로);
  return 사진행읽기(id)!;
}

function 사진꼴(s: 사진) {
  return {
    id: s.id, game_id: s.game_id, quest_id: s.quest_id, scene: s.scene, caption: s.caption, source: s.source,
    taken_at: s.taken_at, used: !!s.used_in_post, removed: !!s.removed, url: `/api/game/shots/${s.id}/img`,
  };
}

function 퀘스트꼴(q: 퀘스트) {
  const 표 = 진행표(q);
  return {
    id: q.id, game_id: q.game_id, name: q.name, kind: q.kind, status: q.status, stuck_reason: q.stuck_reason,
    first_seen_at: q.first_seen_at, done_at: q.done_at, post_id: q.post_id,
    last_shot: q.last_shot_id ? `/api/game/shots/${q.last_shot_id}/img` : null,
    shots: 표.사진수, 찬: 표.찬, 전체: 표.전체, 다참: 표.다참,
    checklist: 표.칸.map((c) => ({ 키: c.키, 이름: c.이름, 찬수: c.찬수, 개수: c.개수, 다참: c.다참 })),
    refs: JSON.parse(q.ref_links_json || "[]"), ref_brief_at: q.ref_brief_at,
    ready: (q.status === "완료" || q.status === "직접플레이대기") && 표.다참,
  };
}

function 목록꼴(gameId: string) {
  return 목록줄들(gameId).map((r) => ({
    id: r.id, name: r.name, kind: r.kind, status: r.status, condition: r.condition_text, order: r.game_order,
    confidence: r.confidence, verified: !!r.verified, quest_id: r.quest_id, seen_at: r.seen_at,
    evidence: (JSON.parse(r.evidence_shot_ids || "[]") as number[]).map((id) => `/api/game/shots/${id}/img`),
  }));
}

/** 대시보드 상태 막대에 쓸 말 (15-4). */
function 화면상태(연결: boolean, state: string | null, 모드: string | undefined): { key: string; 글: string } {
  if (!연결) return { key: "끊김", 글: "집 PC 연결 끊김" };
  switch (state) {
    case "켜는중": return { key: "켜는중", 글: "게임 켜는 중" };
    case "로딩": return { key: "로딩", 글: "로딩 중" };
    case "로그인필요": return { key: "로그인필요", 글: "로그인 필요" };
    case "확인필요": return { key: "확인필요", 글: "확인 필요 — 멈췄습니다" };
    case "목록읽기": return { key: "목록읽기", 글: "게임 목록 읽는 중" };
    case "진행중": return 모드 === "감독" ? { key: "자동진행", 글: "자동 진행 중(감독)" } : { key: "직접플레이", 글: "직접 플레이 중(기록)" };
    default: return { key: "준비됨", 글: "준비됨 — 집 PC 대기 중" };
  }
}

function 에이전트토큰맞나(req: FastifyRequest): boolean {
  const 정답 = (process.env.GAME_AGENT_TOKEN ?? "").trim();
  const 온것 = String(req.headers["x-game-agent-token"] ?? "").trim();
  return !!정답 && 정답.length >= 8 && 온것 === 정답;
}

export async function gameRoutes(app: FastifyInstance) {
  // 이 플러그인 안의 길에만 걸린다(캡슐화). 집 PC 길은 자기 토큰, 나머지는 주인만.
  app.addHook("preHandler", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (url.startsWith("/api/game/agent/")) {
      if (!(process.env.GAME_AGENT_TOKEN ?? "").trim()) {
        reply.code(503).send({ error: "서버에 GAME_AGENT_TOKEN 이 설정되지 않았습니다. 집 PC 연결용 토큰을 먼저 넣어 주세요." });
        return reply;
      }
      if (!에이전트토큰맞나(req)) { reply.code(401).send({ error: "집 PC 토큰이 맞지 않습니다(MAIM_GAME_AGENT_TOKEN)." }); return reply; }
    } else if (!관리자인가() || !지금저장통()) {
      // 🕹️ 게임 플레이는 **관리자 접속(마스터 토큰)만**. 판매용·체험 접속키에는 메뉴도 API 도 없다.
      // 게임 사진 저장통(GAME_SHOT_BUCKET)이 없는 서버(= 판매로 설치한 서버)에서는 기능 자체가 꺼져 있다.
      reply.code(404).send({ error: "없는 주소입니다." });
      return reply;
    }
    if (!지금저장통()) { reply.code(409).send({ needsGameBucket: true, error: 저장통안내 }); return reply; }
  });

  // ════════════ 집 PC ════════════
  app.post("/api/game/agent/heartbeat", async (req) => {
    const b = (req.body ?? {}) as { version?: string; game?: string | null; state?: string; detail?: Record<string, unknown> };
    const 전 = 에이전트();
    하트비트적기({ version: b.version, game: b.game ?? null, state: b.state, detail: { ...전.detail, ...(b.detail ?? {}) } });
    let 세션 = 열린세션();
    const 쉬는중 = !b.state || ["대기", "정지됨", "확인필요", "로그인필요"].includes(b.state);
    if (세션 && 쉬는중) {
      세션끝(세션.id, String(b.detail?.까닭 ?? b.state ?? "대기"));
      기록("세션끝", { 까닭: b.detail?.까닭 ?? b.state }, 세션.game_id);
      세션 = null;
    }
    let command = 명령가져가기();
    if (command?.명령 === "start") {
      const 게임 = String(command.game ?? "");
      const 프로필 = 프로필읽기(게임);
      if (!프로필) command = null;
      else {
        if (세션) 세션끝(세션.id, "새로 시작");
        세션 = 세션시작(게임, command.mission_id ? Number(command.mission_id) : null);
        상태칸고치기({ quest_id: null, quest_name: null });
        기록("세션시작", { mission_id: command.mission_id ?? null }, 게임);
        command = { ...command, profile: 프로필 };
      }
    }
    // 하루 상한·미션 목표 — 서버가 멈춤을 건다.
    let 남은분: number | null = null;
    let mission = null;
    if (세션) {
      const 프로필 = 프로필읽기(세션.game_id);
      남은분 = Math.max(0, (프로필?.하루상한분 ?? 240) - 오늘사용분(세션.game_id));
      if (남은분 <= 0 && command?.명령 !== "stop") command = { 명령: "stop", 까닭: "하루 상한에 닿았습니다" };
      const m = 세션.mission_id ? 미션읽기(세션.mission_id) : null;
      if (m) {
        mission = 미션요약하기(m);
        if (mission.다채움 && !command) command = { 명령: "stop", 까닭: "미션 목표를 다 채웠습니다" };
      }
    }
    const q = 지금퀘스트();
    const 설정 = 게임설정읽기();
    return {
      command, game: 세션?.game_id ?? null, session_id: 세션?.id ?? null, 남은분,
      mission: mission && { id: mission.id, title: mission.title, 목표수: mission.목표수, 완료수: mission.완료수, 노릴퀘스트: mission.노릴퀘스트 },
      quest: q && { id: q.id, name: q.name, 빠진장면: 빠진것(진행표(q).칸) },
      settings: { 판단간격초: 설정.판단간격초, 원본보관일: 설정.원본보관일 },
    };
  });

  app.get("/api/game/agent/profile/:id", async (req, reply) => {
    const p = 프로필읽기((req.params as { id: string }).id);
    if (!p) { reply.code(404); return { error: "프로필이 없습니다." }; }
    return p;
  });

  app.post("/api/game/agent/judge", 큰몸, async (req, reply) => {
    const b = (req.body ?? {}) as { game?: string; image?: string; 상황?: { 최근이벤트?: string[]; 가상힌트?: Record<string, unknown> } };
    const 프로필 = 프로필읽기(String(b.game ?? ""));
    if (!프로필) { reply.code(400); return { error: "모르는 게임입니다." }; }
    const 작은 = (await webp(사진풀기(b.image), 768)).data;
    const q = 지금퀘스트();
    const 빠진 = q ? 빠진것(진행표(q).칸) : [];
    const 이벤트 = 최근기록(5, 프로필.id).map((e) => `${e.kind}${e.detail.이름 ? ` ${e.detail.이름}` : ""}${e.detail.장면 ? ` (${e.detail.장면})` : ""}`);
    const 답 = await 판단하기(프로필, 작은, { 퀘스트: q?.name ?? null, 최근이벤트: [...(b.상황?.최근이벤트 ?? []), ...이벤트].slice(0, 5), 빠진장면: 빠진, 가상힌트: b.상황?.가상힌트 ?? null });
    const 반영 = 판단반영(프로필.id, 답);
    기록("판단", { 장면: 답.장면, 행동: 답.행동, 남김: 답.남김, 이유: 답.이유, quest_id: 반영.quest?.id ?? null }, 프로필.id);
    return { ...답, quest_id: 반영.quest?.id ?? null, quest_name: 반영.quest?.name ?? null, 빠진장면: 반영.빠진장면 };
  });

  app.post("/api/game/agent/shot", 큰몸, async (req, reply) => {
    const b = (req.body ?? {}) as { game?: string; image?: string; scene?: string; caption?: string; quest_id?: number | null; source?: string; taken_at?: string; 목적?: string; 항목id?: number };
    const 프로필 = 프로필읽기(String(b.game ?? ""));
    if (!프로필) { reply.code(400); return { error: "모르는 게임입니다." }; }
    const 장면 = (장면들 as readonly string[]).includes(String(b.scene)) ? String(b.scene) : "기타";
    const 목록확인 = b.목적 === "목록확인" && b.항목id;
    const questId = 목록확인 ? null : (b.quest_id ? Number(b.quest_id) : 지금퀘스트()?.id ?? null);
    const s = await 사진저장하기(프로필.id, 사진풀기(b.image), {
      questId, scene: 장면, caption: String(b.caption ?? "").slice(0, 120),
      source: 목록확인 ? "list" : (["auto", "f9", "upload"].includes(String(b.source)) ? String(b.source) : "auto"), takenAt: b.taken_at,
    });
    if (목록확인) {
      목록줄고치기(Number(b.항목id), { evidenceAdd: s.id });
      기록("목록확인사진", { 항목id: b.항목id, shot_id: s.id }, 프로필.id);
    } else 사진반영(s.id, questId, 장면, 프로필.id);
    return { shot_id: s.id, quest_id: questId };
  });

  app.post("/api/game/agent/list", 큰몸, async (req, reply) => {
    const b = (req.body ?? {}) as { game?: string; images?: string[]; 가상힌트?: unknown };
    const 프로필 = 프로필읽기(String(b.game ?? ""));
    if (!프로필) { reply.code(400); return { error: "모르는 게임입니다." }; }
    const 원본들 = (b.images ?? []).slice(0, 5).map(사진풀기);
    if (!원본들.length) { reply.code(400); return { error: "목록 사진이 없습니다." }; }
    const 근거: number[] = [];
    const 작은것: Buffer[] = [];
    for (const 원본 of 원본들) {
      근거.push((await 사진저장하기(프로필.id, 원본, { questId: null, scene: "목록", caption: "게임 목록 창", source: "list" })).id);
      작은것.push((await webp(원본, 1280)).data);
    }
    const 줄들 = await 목록사진읽기(프로필, 작은것, "", b.가상힌트 ?? null);
    줄들.forEach((r, i) => 목록줄넣기(프로필.id, {
      name: r.이름, kind: r.종류, status: r.상태, condition: r.조건, order: i + 1, confidence: r.확신, evidence: 근거,
      sortKey: 정렬값({ 상태: r.상태, 종류: r.종류, 조건: r.조건, 게임순서: i + 1 }),
    }));
    기록("목록읽음", { 줄: 줄들.length, 사진: 근거.length }, 프로필.id);
    return { ok: true, rows: 줄들.length };
  });

  app.post("/api/game/agent/event", async (req) => {
    const b = (req.body ?? {}) as { game?: string; kind?: string; detail?: Record<string, unknown> };
    const kind = String(b.kind ?? "기타").slice(0, 30);
    const 게임 = b.game ?? null;
    if (kind === "막힘") {
      const qid = Number(b.detail?.quest_id) || 지금퀘스트()?.id;
      if (qid && 게임) 막힘반영(qid, String(b.detail?.이유 ?? "막힘"), 게임);
      else 기록(kind, b.detail ?? {}, 게임);
    } else {
      기록(kind, b.detail ?? {}, 게임);
      if (kind === "정지" || kind === "확인필요" || kind === "로그인필요") 상태칸고치기({ 멈춘까닭: b.detail?.까닭 ?? kind });
    }
    return {};
  });

  // ════════════ 주인 화면 ════════════
  app.get("/api/game/status", async () => {
    const a = 에이전트();
    const 몇초전 = a.last_seen_at ? Math.round((Date.now() - Date.parse(a.last_seen_at)) / 1000) : null;
    const 연결 = 몇초전 !== null && 몇초전 <= 끊김초;
    const 세션 = 열린세션();
    const 프로필들 = 프로필목록();
    const 게임 = 세션?.game_id ?? a.current_game ?? 프로필들[0]?.id;
    const 프로필 = 프로필들.find((p) => p.id === 게임);
    const q = 지금퀘스트();
    const m = 세션?.mission_id ? 미션읽기(세션.mission_id) : null;
    const 오늘 = new Date(Date.now() - 86_400_000).toISOString();
    return {
      needsGameBucket: !지금저장통(),
      bucket: 지금저장통()?.kind ?? null,
      agentTokenSet: !!(process.env.GAME_AGENT_TOKEN ?? "").trim(),
      agent: {
        connected: 연결, secondsAgo: 몇초전, version: a.agent_version, state: a.state, game: a.current_game,
        detail: a.detail, display: 화면상태(연결, a.state, 프로필?.모드),
      },
      pending: a.command,
      session: 세션 && { id: 세션.id, game: 세션.game_id, mission_id: 세션.mission_id, started_at: 세션.started_at },
      game: 게임,
      usedMinutes: Math.round(오늘사용분(게임)),
      limitMinutes: 프로필?.하루상한분 ?? 240,
      profiles: 프로필들.map((p) => ({ id: p.id, 이름: p.이름, 모드: p.모드 })),
      quest: q ? 퀘스트꼴(q) : null,
      mission: m ? 미션요약하기(m) : null,
      stats: 게임 ? {
        todayShots: (최근사진들(500, 게임).filter((s) => s.taken_at >= 오늘 && s.source !== "list")).length,
        ready: 글준비수(게임),
        waiting: 퀘스트목록(게임, "직접플레이대기").length,
      } : null,
      recentShots: 최근사진들(12, 게임).filter((s) => s.source !== "list").slice(0, 8).map(사진꼴),
      log: 최근기록(15, 게임),
    };
  });

  app.post("/api/game/start", async (req, reply) => {
    const b = (req.body ?? {}) as { game?: string; mission_id?: number | null };
    const 프로필 = 프로필읽기(String(b.game ?? ""));
    if (!프로필) { reply.code(400); return { error: "게임을 골라 주세요." }; }
    if (오늘사용분(프로필.id) >= 프로필.하루상한분) { reply.code(409); return { error: `오늘 하루 상한(${프로필.하루상한분}분)을 다 썼습니다. 내일 다시 열립니다.` }; }
    const m = b.mission_id ? 미션읽기(Number(b.mission_id)) : null;
    if (b.mission_id && (!m || m.game_id !== 프로필.id)) { reply.code(400); return { error: "이 게임의 미션이 아닙니다." }; }
    명령걸기({ 명령: "start", game: 프로필.id, mission_id: m?.id ?? null });
    기록("시작명령", { mission_id: m?.id ?? null }, 프로필.id);
    return { ok: true };
  });

  app.post("/api/game/stop", async () => {
    명령걸기({ 명령: "stop", 까닭: "대시보드 [즉시 정지]" });
    기록("정지명령", {}, 열린세션()?.game_id ?? null);
    return { ok: true };
  });

  app.post("/api/game/capture", async (req) => {
    const b = (req.body ?? {}) as { 목적?: string; 항목id?: number };
    명령걸기({ 명령: "capture", 목적: b.목적 ?? "수동", 항목id: b.항목id ?? null });
    return { ok: true };
  });

  // ── 퀘스트 ──
  app.get("/api/game/quests", async (req) => {
    const { game, status } = req.query as { game?: string; status?: string };
    const 게임 = game || 프로필목록()[0]?.id || "";
    return { items: 퀘스트목록(게임, status || undefined).map(퀘스트꼴) };
  });

  app.post("/api/game/quests/:id/done", async (req, reply) => {
    const q = 사람이완료(Number((req.params as { id: string }).id));
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    return 퀘스트꼴(q);
  });

  app.get("/api/game/quests/:id/shots", async (req, reply) => {
    const q = 퀘스트읽기(Number((req.params as { id: string }).id));
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    return { quest: 퀘스트꼴(q), items: 퀘스트사진들(q).filter((s) => s.source !== "list").map(사진꼴) };
  });

  app.put("/api/game/quests/:id/order", async (req, reply) => {
    const q = 퀘스트읽기(Number((req.params as { id: string }).id));
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    const ids = ((req.body as { ids?: number[] })?.ids ?? []).map(Number).filter(Boolean);
    퀘스트고치기(q.id, { shot_order_json: JSON.stringify(ids) });
    return { ok: true };
  });

  app.put("/api/game/quests/:id/checklist", async (req, reply) => {
    const q = 퀘스트읽기(Number((req.params as { id: string }).id));
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    const 고름 = ((req.body as { checklist?: 칸고름[] })?.checklist ?? []).filter((c) => 칸목록.some((k) => k.키 === c.키));
    퀘스트고치기(q.id, { checklist_json: 고름.length ? JSON.stringify(고름) : null });
    return 퀘스트꼴(퀘스트읽기(q.id)!);
  });

  app.put("/api/game/quests/:id/refs", async (req, reply) => {
    const q = 퀘스트읽기(Number((req.params as { id: string }).id));
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    const 새것 = 주소다듬기((req.body as { refs?: unknown })?.refs);
    const 옛것 = JSON.stringify(JSON.parse(q.ref_links_json || "[]").map((a: { url: string }) => a.url).sort());
    const 바뀜 = 옛것 !== JSON.stringify(새것.map((a) => a.url).sort());
    // 주소가 바뀌면 메모를 지운다 — 다음 글이 새로 읽는다.
    퀘스트고치기(q.id, { ref_links_json: JSON.stringify(새것), ...(바뀜 ? { ref_brief: null, ref_brief_at: null } : {}) });
    return 퀘스트꼴(퀘스트읽기(q.id)!);
  });

  app.post("/api/game/quests/:id/refs/search", async (req, reply) => {
    const q = 퀘스트읽기(Number((req.params as { id: string }).id));
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    const 프로필 = 프로필읽기(q.game_id);
    try {
      return { items: await 참고글찾기(프로필?.이름 ?? q.game_id, q.name, 프로필?.기본참고주소 ?? []) };
    } catch (탈) {
      reply.code(502);
      return { error: `참고 글을 찾지 못했습니다 — ${(탈 as Error).message}` };
    }
  });

  app.post("/api/game/quests/:id/post", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const q = 퀘스트읽기(id);
    if (!q) { reply.code(404); return { error: "퀘스트를 찾을 수 없습니다." }; }
    if (q.status === "진행중") { reply.code(400); return { error: "아직 진행 중인 퀘스트입니다. 끝난 뒤에 만들어 주세요." }; }
    const refs = (req.body as { refs?: boolean })?.refs !== false;
    const post = await generateGamePost(id, refs);
    기록("공략글", { quest_id: id, post_id: post.id, 이름: q.name }, q.game_id);
    return post;
  });

  // ── 사진 ──
  app.get("/api/game/shots/:id/img", async (req, reply) => {
    const s = 사진행읽기(Number((req.params as { id: string }).id));
    if (!s || s.deleted_at || !s.gcs_path) { reply.code(404); return { error: "사진이 없습니다." }; }
    const 주소 = await 서명주소(s.gcs_path);
    if (주소) return reply.redirect(주소);
    const 내용 = await 사진읽기(s.gcs_path);
    if (!내용) { reply.code(404); return { error: "사진 파일이 없습니다." }; }
    reply.type("image/webp").header("Cache-Control", "private, max-age=900")
      .header("Content-Disposition", `inline; filename="game-${s.game_id}-${s.id}.webp"`);
    return 내용;
  });

  // 앨범에서 빼기 (지우지 않는다 — [다시 넣기] 로 되돌림)
  app.delete("/api/game/shots/:id", async (req) => {
    사진고치기(Number((req.params as { id: string }).id), { removed: true });
    return { ok: true };
  });
  app.put("/api/game/shots/:id", async (req) => {
    const b = (req.body ?? {}) as { removed?: boolean; quest_id?: number | null; scene?: string; caption?: string };
    사진고치기(Number((req.params as { id: string }).id), {
      removed: b.removed, questId: b.quest_id, caption: b.caption,
      scene: b.scene && (장면들 as readonly string[]).includes(b.scene) ? b.scene : undefined,
    });
    return { ok: true };
  });

  // 캡처 고르기 창 — 한 쪽 8장 (15-8)
  app.get("/api/game/shots", async (req) => {
    const q = req.query as { game?: string; quest?: string; scene?: string; q?: string; unused?: string; page?: string };
    const 결과 = 사진찾기({ game: q.game || undefined, quest: q.quest ? Number(q.quest) : undefined, scene: q.scene || undefined, q: q.q?.trim() || undefined, unused: q.unused === "1", page: Number(q.page) || 1 });
    return { ...결과, items: 결과.items.map(사진꼴) };
  });

  // 사진 파일 올리기 (휴대폰·PC 캡처) — 퀘스트에 붙이거나 목록 줄 근거로
  app.post("/api/game/upload", 큰몸, async (req, reply) => {
    const b = (req.body ?? {}) as { game?: string; image?: string; quest_id?: number; scene?: string; caption?: string };
    const 프로필 = 프로필읽기(String(b.game ?? ""));
    if (!프로필) { reply.code(400); return { error: "게임을 골라 주세요." }; }
    const 장면 = (장면들 as readonly string[]).includes(String(b.scene)) ? String(b.scene) : "기타";
    const s = await 사진저장하기(프로필.id, 사진풀기(b.image), { questId: b.quest_id ? Number(b.quest_id) : null, scene: 장면, caption: String(b.caption ?? "직접 올린 사진"), source: "upload" });
    if (s.quest_id) 사진반영(s.id, s.quest_id, 장면, 프로필.id);
    return 사진꼴(s);
  });

  // ── 미션 ──
  app.get("/api/game/missions", async (req) => {
    const { game } = req.query as { game?: string };
    return {
      items: 미션목록(game || undefined).map((m) => ({ ...미션요약하기(m), game_id: m.game_id, targets: 미션목표들(m), checklist: 미션칸고름(m), created_at: m.created_at })),
      choices: 칸목록.map((c) => ({ 키: c.키, 이름: c.이름, 개수: c.개수 })),
      defaults: { 메인: 칸들(null, "메인").map((c) => c.키), 서브: 칸들(null, "서브").map((c) => c.키) },
    };
  });

  const 미션받기 = (req: FastifyRequest, reply: FastifyReply) => {
    const b = (req.body ?? {}) as { game_id?: string; title?: string; targets?: 목표[]; checklist?: 칸고름[] | null };
    const 프로필 = 프로필읽기(String(b.game_id ?? ""));
    const title = String(b.title ?? "").trim().slice(0, 40);
    if (!프로필 || !title) { reply.code(400); return null; }
    const targets = (b.targets ?? []).flatMap((t): 목표[] => {
      if (t.퀘스트 && String(t.퀘스트).trim()) return [{ 종류: "이름", 퀘스트: String(t.퀘스트).trim().slice(0, 60), 개수: 1 }];
      if (["목록순서", "메인", "서브", "일일", "기타"].includes(t.종류)) return [{ 종류: t.종류, 개수: Math.max(1, Math.min(20, Number(t.개수) || 1)) }];
      return [];
    }).slice(0, 10);
    if (!targets.length) { reply.code(400); return null; }
    const checklist = (b.checklist ?? []).filter((c) => 칸목록.some((k) => k.키 === c.키));
    return { game_id: 프로필.id, title, targets, checklist: checklist.length ? checklist : null };
  };

  app.post("/api/game/missions", async (req, reply) => {
    const 값 = 미션받기(req, reply);
    if (!값) return { error: "게임·미션 이름·목표를 하나 이상 넣어 주세요." };
    return 미션요약하기(미션저장(null, 값));
  });

  app.put("/api/game/missions/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!미션읽기(id)) { reply.code(404); return { error: "미션을 찾을 수 없습니다." }; }
    const 값 = 미션받기(req, reply);
    if (!값) return { error: "게임·미션 이름·목표를 하나 이상 넣어 주세요." };
    return 미션요약하기(미션저장(id, 값));
  });

  app.delete("/api/game/missions/:id", async (req) => ({ ok: 미션지우기(Number((req.params as { id: string }).id)) }));

  // ── 게임 미션 목록 (15-6) ──
  app.get("/api/game/list", async (req) => {
    const { game } = req.query as { game?: string };
    const 게임 = game || 프로필목록()[0]?.id || "";
    const 읽은때 = 최근기록(200, 게임).find((e) => e.kind === "목록읽음");
    return { items: 목록꼴(게임), readAt: 읽은때?.at ?? null, mode: 프로필읽기(게임)?.모드 };
  });

  app.post("/api/game/list/sync", async (req, reply) => {
    const 프로필 = 프로필읽기(String((req.body as { game?: string })?.game ?? ""));
    if (!프로필) { reply.code(400); return { error: "게임을 골라 주세요." }; }
    명령걸기({ 명령: "sync_list", game: 프로필.id });
    return { ok: true, note: 프로필.모드 === "기록" ? "게임에서 목록 창을 열어 두고 집 PC 에서 F10 을 눌러 주세요(여러 장이면 여러 번)." : "집 PC 가 목록 창을 열어 읽습니다(5초 안에 시작)." };
  });

  app.post("/api/game/list/:id/evidence", 큰몸, async (req, reply) => {
    const r = 목록줄읽기(Number((req.params as { id: string }).id));
    if (!r) { reply.code(404); return { error: "목록 줄을 찾을 수 없습니다." }; }
    const b = (req.body ?? {}) as { image?: string; shot_id?: number; capture?: boolean };
    if (b.capture) {
      명령걸기({ 명령: "capture", 목적: "목록확인", 항목id: r.id, game: r.game_id });
      return { ok: true, note: "집 PC 가 다음 폴링(5초 안)에 찍습니다. 그 퀘스트 상세 창을 열어 두세요." };
    }
    let 사진id = Number(b.shot_id) || 0;
    if (b.image) 사진id = (await 사진저장하기(r.game_id, 사진풀기(b.image), { questId: null, scene: "목록", caption: `목록 확인: ${r.name}`, source: "list" })).id;
    const s = 사진id ? 사진행읽기(사진id) : null;
    if (!s) { reply.code(400); return { error: "붙일 사진이 없습니다." }; }
    목록줄고치기(r.id, { evidenceAdd: s.id });
    const 프로필 = 프로필읽기(r.game_id)!;
    const 내용 = await 사진읽기(s.gcs_path);
    let 제안 = null;
    if (내용) {
      try { 제안 = (await 목록사진읽기(프로필, [내용], r.name))[0] ?? null; } catch { /* 못 읽으면 사람이 적는다 */ }
    }
    return { ok: true, shot: 사진꼴(s), proposal: 제안 };
  });

  app.put("/api/game/list/:id", async (req, reply) => {
    const r = 목록줄읽기(Number((req.params as { id: string }).id));
    if (!r) { reply.code(404); return { error: "목록 줄을 찾을 수 없습니다." }; }
    const b = (req.body ?? {}) as { name?: string; kind?: string; status?: string; condition?: string; verified?: boolean };
    const 값 = {
      name: b.name?.trim().slice(0, 60) || r.name, kind: b.kind ?? r.kind, status: b.status ?? r.status, condition: b.condition ?? r.condition_text ?? "",
    };
    목록줄고치기(r.id, { ...값, verified: b.verified ?? true, sortKey: 정렬값({ 상태: 값.status, 종류: 값.kind, 조건: 값.condition, 게임순서: r.game_order }) });
    return { ok: true };
  });

  // ── 프로필·설정 ──
  app.get("/api/game/profiles", async () => ({ items: 프로필목록() }));
  app.get("/api/game/profiles/:id", async (req, reply) => {
    const p = 프로필읽기((req.params as { id: string }).id);
    if (!p) { reply.code(404); return { error: "프로필이 없습니다." }; }
    return p;
  });
  app.put("/api/game/profiles/:id", async (req, reply) => {
    const p = 프로필저장((req.params as { id: string }).id, (req.body ?? {}) as object);
    if (!p) { reply.code(404); return { error: "프로필이 없습니다." }; }
    기록("프로필고침", { 모드: p.모드 }, p.id);
    return p;
  });
  app.get("/api/game/settings", async () => 게임설정읽기());
  app.put("/api/game/settings", async (req) => 게임설정저장((req.body ?? {}) as object));

  // ════════════ 📝 포스팅 카드 — 내 게임 캡처 (15-8) ════════════
  app.get("/api/posts/:id/game-shots", async (req) => {
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    const 게임 = post ? getCategory(post.category_id)?.game_id ?? null : null;
    return { game: 게임, items: 글사진들(id).map(사진꼴) };
  });

  app.post("/api/posts/:id/game-shots", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post) { reply.code(404); return { error: "포스팅을 찾을 수 없습니다." }; }
    const b = (req.body ?? {}) as { shot_ids?: number[]; mode?: string };
    const 고른 = (b.shot_ids ?? []).slice(0, 10).map((n) => 사진행읽기(Number(n))).filter((s): s is 사진 => !!s && !s.deleted_at);
    if (!고른.length) { reply.code(400); return { error: "고른 사진이 없습니다." }; }
    const 방식 = b.mode === "replace" ? "replace" : "append";
    await 캡처를글에(post, 고른, 방식);
    return getPost(id);
  });

  app.delete("/api/posts/:id/game-shots/:shotId", async (req, reply) => {
    const { id, shotId } = req.params as { id: string; shotId: string };
    const post = getPost(Number(id));
    if (!post) { reply.code(404); return { error: "포스팅을 찾을 수 없습니다." }; }
    글사진빼기(post.id, Number(shotId));
    // 글의 사진 칸을 남은 캡처로 다시 맞춘다.
    await 캡처를글에(post, 글사진들(post.id), "replace");
    return getPost(post.id);
  });

  app.post("/api/posts/:id/game-shots/auto", async (req, reply) => {
    const post = getPost(Number((req.params as { id: string }).id));
    if (!post) { reply.code(404); return { error: "포스팅을 찾을 수 없습니다." }; }
    const 게임 = getCategory(post.category_id)?.game_id;
    if (!게임) { reply.code(400); return { error: "게임을 연결한 카테고리 글이 아닙니다." }; }
    const n = await pickGameShots(post, 게임, { count: 3, append: true });
    if (!n) { reply.code(409); return { error: "고를 캡처가 더 없습니다 — 집 PC 에서 더 찍어 주세요.", shortage: true }; }
    return getPost(post.id);
  });

  // 미션 확인을 화면에서 다시 셈하고 싶을 때(디버그·새로고침)
  app.post("/api/game/missions/recheck", async () => ({ mission: 미션확인() }));
}
