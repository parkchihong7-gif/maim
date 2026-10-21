/**
 * 🕹️ 게임 스샷 API (2026-10-21 개편). **관리자 접속 전용** — 체험·판매 키에는 404.
 *
 * 집 PC 전용 (헤더 `x-game-agent-token`, 대시보드 토큰과 따로):
 *   POST /api/game/agent/heartbeat   30초마다. 연결 표시 + 단축키·게임 목록·원본보관일을 받아 간다
 *   POST /api/game/agent/shot        단축키로 찍은 사진 + 맨 앞 창 제목 → 게임을 찾아 그 게임 «오늘» 에 넣는다
 *
 * 화면(관리자):
 *   GET  /api/game/status · GET/POST/PUT /api/game/games · GET /api/game/shots · 스샷 이미지·메모·지우기
 *   POST /api/game/etc/register («기타» 를 새 게임으로) · 설정·토큰 · 📝 포스팅 카드의 스샷 붙이기
 *
 * 사진은 multipart 대신 JSON 안의 base64 로 받는다. 한 장에 수백 KB 라 이 길이 단순하다.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import sharp from "sharp";
import { 관리자인가 } from "../../tenancy.js";
import { getPost } from "../../db/repositories/posts.js";
import { getCategory, listAllCategories } from "../../db/repositories/categories.js";
import {
  게임설정읽기, 게임설정저장, 단축키들, 게임목록, 게임읽기, 게임추가, 게임고치기, 에이전트, 하트비트적기,
  사진기록넣기, 사진경로적기, 사진읽기 as 사진행읽기, 사진지움표시, 사진고치기, 기타옮기기, 사진찾기, 사진수들, 마지막사진,
  글사진들, 글사진빼기, 에이전트토큰들, 보여줄토큰, 새토큰, type 사진, type 날짜,
} from "../../db/repositories/gamePlay.js";
import { 지금저장통, 저장통안내, 사진경로, 사진넣기, 사진읽기, 사진지우기, 서명주소 } from "../../game/사진저장.js";
import { 기타, 창으로게임 } from "../../game/프로필.js";
import { 캡처를글에, pickGameShots } from "../../game/캡처고르기.js";

const 큰몸 = { bodyLimit: 25 * 1024 * 1024 };
/** 하트비트가 이보다 오래 없으면 «연결 끊김». 집 PC 는 30초마다 온다. */
const 끊김초 = 75;

function 사진풀기(b64: unknown): Buffer {
  const 글 = String(b64 ?? "").replace(/^data:[^,]+,/, "");
  if (!글) throw Object.assign(new Error("사진이 비어 있습니다."), { statusCode: 400 });
  return Buffer.from(글, "base64");
}

/** 사진 한 장 저장 — 가로 1280 WebP 로 줄여 기록 → 저장통 → 경로. */
async function 사진저장하기(gameId: string, 원본: Buffer, 메타: { source: string; caption?: string; windowTitle?: string; takenAt?: string }): Promise<사진> {
  const { data, info } = await sharp(원본).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const id = 사진기록넣기({ gameId, ...메타, width: info.width, height: info.height });
  const 경로 = 사진경로(gameId, id);
  await 사진넣기(경로, data);
  사진경로적기(id, 경로);
  return 사진행읽기(id)!;
}

const 게임이름 = (id: string) => (id === 기타.id ? 기타.이름 : 게임읽기(id)?.이름 ?? id);

function 사진꼴(s: 사진) {
  return {
    id: s.id, game_id: s.game_id, game_name: 게임이름(s.game_id), caption: s.caption, source: s.source,
    taken_at: s.taken_at, used: !!s.used_in_post, window_title: s.window_title, url: `/api/game/shots/${s.id}/img`,
  };
}

function 에이전트토큰맞나(req: FastifyRequest): boolean {
  const 온것 = String(req.headers["x-game-agent-token"] ?? "").trim();
  return !!온것 && 에이전트토큰들().some((t) => t.length === 온것.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(온것)));
}

function 연결상태() {
  const a = 에이전트();
  const 몇초전 = a.last_seen_at ? Math.round((Date.now() - Date.parse(a.last_seen_at)) / 1000) : null;
  return { connected: 몇초전 !== null && 몇초전 <= 끊김초, secondsAgo: 몇초전, version: a.agent_version };
}

export async function gameRoutes(app: FastifyInstance) {
  // 이 플러그인 안의 길에만 걸린다(캡슐화). 집 PC 길은 자기 토큰, 나머지는 관리자만.
  app.addHook("preHandler", async (req, reply) => {
    const url = req.url.split("?")[0];
    if (url.startsWith("/api/game/agent/")) {
      if (!에이전트토큰들().length) {
        reply.code(503).send({ error: "집 PC 연결 토큰이 아직 없습니다. 대시보드 [🕹️ 게임 스샷 → 설정 → 🔑 집 PC 연결] 에서 만들어 주세요." });
        return reply;
      }
      if (!에이전트토큰맞나(req)) { reply.code(401).send({ error: "집 PC 토큰이 맞지 않습니다(MAIM_GAME_AGENT_TOKEN)." }); return reply; }
    } else if (!관리자인가() || !지금저장통()) {
      // 🕹️ 게임 스샷은 **관리자 접속(마스터 토큰)만**. 판매용·체험 접속키에는 메뉴도 API 도 없다.
      // 게임 사진 저장통(GAME_SHOT_BUCKET)이 없는 서버(= 판매로 설치한 서버)에서는 기능 자체가 꺼져 있다.
      reply.code(404).send({ error: "없는 주소입니다." });
      return reply;
    }
    if (!지금저장통()) { reply.code(409).send({ needsGameBucket: true, error: 저장통안내 }); return reply; }
  });

  // ════════════ 집 PC ════════════
  app.post("/api/game/agent/heartbeat", async (req) => {
    하트비트적기((req.body as { version?: string } | undefined)?.version);
    const s = 게임설정읽기();
    return { settings: { 단축키: s.단축키, 원본보관일: s.원본보관일 }, games: 게임목록() };
  });

  app.post("/api/game/agent/shot", 큰몸, async (req) => {
    const b = (req.body ?? {}) as { image?: string; window_title?: string; taken_at?: string };
    const 창 = String(b.window_title ?? "").slice(0, 120);
    const 게임 = 창으로게임(창, 게임목록());
    const gameId = 게임?.id ?? 기타.id;
    const s = await 사진저장하기(gameId, 사진풀기(b.image), { source: "f9", windowTitle: 창, takenAt: b.taken_at });
    하트비트적기((req.headers["x-agent-version"] as string | undefined) ?? 에이전트().agent_version);
    return { shot_id: s.id, game_id: gameId, game_name: 게임이름(gameId), today: 사진수들()[gameId]?.오늘 ?? 1 };
  });

  // ════════════ 화면 ════════════
  app.get("/api/game/status", async () => {
    const 마지막 = 마지막사진();
    return {
      needsGameBucket: !지금저장통(),
      agentTokenSet: 에이전트토큰들().length > 0,
      agent: 연결상태(),
      단축키: 게임설정읽기().단축키,
      lastShot: 마지막 && { taken_at: 마지막.taken_at, game_name: 게임이름(마지막.game_id) },
    };
  });

  app.get("/api/game/games", async () => {
    const 수 = 사진수들();
    const 카테고리들 = listAllCategories() as ({ name: string; game_id?: string | null })[];
    const 빈수 = { 전체: 0, 오늘: 0, 어제: 0, 칠일: 0 };
    return {
      items: 게임목록().map((g) => ({
        ...g, shots: 수[g.id] ?? 빈수, categories: 카테고리들.filter((c) => c.game_id === g.id).map((c) => c.name),
      })),
      etc: { ...기타, shots: 수[기타.id] ?? 빈수 },
    };
  });

  const 게임값 = (req: FastifyRequest) => {
    const b = (req.body ?? {}) as { 이름?: string; 창제목?: string };
    return { 이름: String(b.이름 ?? "").trim(), 창제목: String(b.창제목 ?? "").trim() };
  };

  app.post("/api/game/games", async (req, reply) => {
    const 값 = 게임값(req);
    if (!값.이름) { reply.code(400); return { error: "게임 이름을 넣어 주세요." }; }
    if (게임목록().some((g) => g.이름 === 값.이름)) { reply.code(409); return { error: "같은 이름의 게임이 이미 있습니다." }; }
    const g = 게임추가(값);
    return { ...g, moved: 기타옮기기(g.창제목, g.id) };
  });

  app.put("/api/game/games/:id", async (req, reply) => {
    const 값 = 게임값(req);
    if (!값.이름) { reply.code(400); return { error: "게임 이름을 넣어 주세요." }; }
    const g = 게임고치기((req.params as { id: string }).id, 값);
    if (!g) { reply.code(404); return { error: "게임을 찾을 수 없습니다." }; }
    return { ...g, moved: 기타옮기기(g.창제목, g.id) };
  });

  /** «기타» 스샷 한 장을 보고 새 게임으로 등록 — 그 창 제목이 들어간 «기타» 스샷을 모두 옮긴다. */
  app.post("/api/game/etc/register", async (req, reply) => {
    const b = (req.body ?? {}) as { shot_id?: number; 이름?: string; 창제목?: string };
    const s = 사진행읽기(Number(b.shot_id));
    if (!s || s.game_id !== 기타.id) { reply.code(400); return { error: "«기타» 스샷이 아닙니다." }; }
    const 이름 = String(b.이름 ?? "").trim();
    const 창제목 = String(b.창제목 ?? s.window_title ?? "").trim();
    if (!이름 || !창제목) { reply.code(400); return { error: "게임 이름과 창 제목 글자를 넣어 주세요." }; }
    const 있던 = 게임목록().find((g) => g.이름 === 이름);
    const g = 있던 ? 게임고치기(있던.id, { 이름, 창제목 })! : 게임추가({ 이름, 창제목 });
    const moved = 기타옮기기(창제목, g.id);
    if (!moved) 사진고치기(s.id, { gameId: g.id });
    return { ...g, moved: moved || 1 };
  });

  // ── 스샷 ──
  app.get("/api/game/shots", async (req) => {
    const q = req.query as { game?: string; day?: string; unused?: string; page?: string; size?: string };
    const day = (["today", "yesterday", "7d", "all"].includes(String(q.day)) ? q.day : "all") as 날짜;
    const 결과 = 사진찾기({ game: q.game || undefined, day, unused: q.unused === "1", page: Number(q.page) || 1, size: Number(q.size) || 8 });
    return { ...결과, items: 결과.items.map(사진꼴) };
  });

  app.get("/api/game/shots/:id/img", async (req, reply) => {
    const s = 사진행읽기(Number((req.params as { id: string }).id));
    if (!s || s.deleted_at || !s.gcs_path) { reply.code(404); return { error: "사진이 없습니다." }; }
    // ?raw=1 — 화면이 [복사] 할 때. 저장통 서명 주소로 넘기면 다른 사이트라 브라우저가 내용을 못 읽는다(CORS).
    const 주소 = (req.query as { raw?: string }).raw === "1" ? null : await 서명주소(s.gcs_path);
    if (주소) return reply.redirect(주소);
    const 내용 = await 사진읽기(s.gcs_path);
    if (!내용) { reply.code(404); return { error: "사진 파일이 없습니다." }; }
    reply.type("image/webp").header("Cache-Control", "private, max-age=900")
      .header("Content-Disposition", `inline; filename="game-${s.game_id}-${s.id}.webp"`);
    return 내용;
  });

  // 메모 고치기·다른 게임으로 옮기기
  app.put("/api/game/shots/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!사진행읽기(id)) { reply.code(404); return { error: "사진이 없습니다." }; }
    const b = (req.body ?? {}) as { caption?: string; game_id?: string };
    const gameId = b.game_id && (b.game_id === 기타.id || 게임읽기(b.game_id)) ? b.game_id : undefined;
    사진고치기(id, { caption: b.caption, gameId });
    return 사진꼴(사진행읽기(id)!);
  });

  // 지우기 — 저장통에서도 지운다. 이미 글에 붙인 것은 글 폴더에 따로 사본이 있어 글에는 남는다.
  app.post("/api/game/shots/delete", async (req) => {
    const ids = (((req.body ?? {}) as { ids?: number[] }).ids ?? []).map(Number).filter(Boolean).slice(0, 200);
    let n = 0;
    for (const id of ids) {
      const s = 사진행읽기(id);
      if (!s || s.deleted_at) continue;
      if (s.gcs_path) await 사진지우기(s.gcs_path);
      사진지움표시(id);
      n += 1;
    }
    return { deleted: n };
  });

  // 사진 파일 올리기 (휴대폰·PC 캡처)
  app.post("/api/game/upload", 큰몸, async (req, reply) => {
    const b = (req.body ?? {}) as { game?: string; image?: string; caption?: string };
    const gameId = String(b.game ?? "");
    if (gameId !== 기타.id && !게임읽기(gameId)) { reply.code(400); return { error: "게임을 골라 주세요." }; }
    return 사진꼴(await 사진저장하기(gameId, 사진풀기(b.image), { source: "upload", caption: String(b.caption ?? "") }));
  });

  // ── 설정·토큰 ──
  app.get("/api/game/settings", async () => ({ ...게임설정읽기(), 단축키들 }));
  app.put("/api/game/settings", async (req) => ({ ...게임설정저장((req.body ?? {}) as object), 단축키들 }));
  app.get("/api/game/agent-token", async () => 보여줄토큰());
  app.post("/api/game/agent-token/new", async () => ({ token: 새토큰(), from: "db" }));

  // ════════════ 📝 포스팅 카드 — 내 게임 스샷 ════════════
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
    await 캡처를글에(post, 고른, b.mode === "replace" ? "replace" : "append");
    return getPost(id);
  });

  app.delete("/api/posts/:id/game-shots/:shotId", async (req, reply) => {
    const { id, shotId } = req.params as { id: string; shotId: string };
    const post = getPost(Number(id));
    if (!post) { reply.code(404); return { error: "포스팅을 찾을 수 없습니다." }; }
    글사진빼기(post.id, Number(shotId));
    await 캡처를글에(post, 글사진들(post.id), "replace");
    return getPost(post.id);
  });

  // [+ 스샷 더 넣기] — 안 쓴 최근 스샷 다음 3장
  app.post("/api/posts/:id/game-shots/auto", async (req, reply) => {
    const post = getPost(Number((req.params as { id: string }).id));
    if (!post) { reply.code(404); return { error: "포스팅을 찾을 수 없습니다." }; }
    const 게임 = getCategory(post.category_id)?.game_id;
    if (!게임) { reply.code(400); return { error: "게임을 연결한 카테고리 글이 아닙니다." }; }
    const n = await pickGameShots(post, 게임, { count: 3, append: true });
    if (!n) { reply.code(409); return { error: "아직 글에 안 쓴 스샷이 없습니다 — 게임에서 단축키로 더 찍어 주세요.", shortage: true }; }
    return getPost(post.id);
  });
}
