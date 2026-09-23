import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import { SECRET_SETTINGS, ENGINE_IDS, ENGINES } from "../ai/engines.js";
import { getSetting } from "../db/repositories/settings.js";
import { config } from "../config.js";
import { getDb } from "../db/index.js";
import { categoriesRoutes } from "./routes/categories.js";
import { queueRoutes } from "./routes/queue.js";
import { historyRoutes } from "./routes/history.js";
import { manualRunRoutes } from "./routes/manualRun.js";
import { postsRoutes } from "./routes/posts.js";
import { settingsRoutes } from "./routes/settings.js";
import { authRoutes } from "./routes/auth.js";
import { imageDownloadsRoutes } from "./routes/imageDownloads.js";
import { tenantsRoutes } from "./routes/tenants.js";
import { findSession } from "../db/repositories/keyserverSessions.js";
import { 자리에서, 주인, 체험역할, type 쓰는이 } from "../tenancy.js";
/** 지금 서버가 들고 있는 비밀값들. 설정에 저장된 것과 환경변수 양쪽. */
function 비밀들(): string[] {
  const 것들: string[] = [];
  for (const 칸 of SECRET_SETTINGS) {
    try { const v = getSetting(칸); if (v) 것들.push(v.trim()); } catch { /* DB 가 아직이면 넘어간다 */ }
  }
  for (const id of ENGINE_IDS) {
    const v = process.env[ENGINES[id].auth.envVar];
    if (v) 것들.push(v.trim());
  }
  if (config.dashboardToken) 것들.push(config.dashboardToken);
  return 것들;
}


/**
 * 오류 글에 키가 섞여 나가지 않게 지운다.
 *
 * 오류에는 명령 도구가 뱉은 말이 통째로 담긴다. 그 안에 키가 그대로
 * 들어 있을 수 있는데, 화면은 여러 사람이 본다.
 */
function 비밀빼고(글: string): string {
  let 답 = 글;
  for (const 것 of 비밀들()) {
    if (것 && 것.length >= 8) 답 = 답.split(것).join("••••••");
  }
  return 답;
}

/**
 * 이 코드가 만들어진 때. 빌드가 `dist/BUILD_AT` 에 적어 둔다.
 *
 * 한 번 읽고 기억한다. 도는 동안 바뀔 값이 아니다.
 */
const 만든때 = (() => {
  let 값: string | null = null;
  return (): string => {
    if (값 !== null) return 값;
    try {
      값 = fs.readFileSync(path.join(import.meta.dirname, "..", "BUILD_AT"), "utf8").trim();
    } catch {
      값 = "(모름 — 개발 중이거나 빌드 기록이 없습니다)";
    }
    return 값;
  };
})();


export async function buildServer() {
  // 대시보드가 15초마다 자동 새로고침하면서 여러 API를 호출하는데, 매 요청마다
  // "incoming request"/"request completed" 로그가 찍히면 터미널이 너무 시끄러워진다.
  // 에러/경고는 그대로 로그에 남기고, 정상 요청 단위 로그만 끈다.
  const app = Fastify({ logger: true, disableRequestLogging: true });

  /**
   * **탈이 났을 때 「Internal Server Error」 만 남기지 않는다.**
   *
   * 여태 라우트 안에서 뭔가 터지면 화면에는 저 여섯 글자만 떴다. 무엇이
   * 왜 안 됐는지 알 길이 없어서, 고치는 사람도 서버를 우회해 직접 불러
   * 봐야 원인을 알았다. 쓰시는 분은 그마저도 못 한다.
   *
   * 오류 글에는 도구가 한 말이 들어 있고, 그게 유일한 단서다. 그대로
   * 드린다. 다만 **키가 섞여 나갈 수는 없으니** 지우고 보낸다.
   */
  app.setErrorHandler((탈, req, reply) => {
    req.log.error({ err: 탈 }, "요청 처리 중 탈");
    const 코드 = 탈.statusCode && 탈.statusCode >= 400 ? 탈.statusCode : 500;
    reply.code(코드).send({ error: 비밀빼고(탈.message || String(탈)) });
  });

  /**
   * 살아 있나 + **쓸 수 있나.**
   *
   * 한 번 데였다. 읽는 요청은 전부 200 인데 로그인만 «Internal Server Error»
   * 가 났다. 읽기는 되고 쓰기만 막히면 그렇게 보인다 — 디스크가 찼거나,
   * 파일이 읽기 전용이거나, 표가 없거나. 그런데 그것을 알아보려면 로그를
   * 뒤져야 했고, 로그에는 아무것도 안 남아 있었다.
   *
   * 이제 이 한 줄이면 갈린다. 비밀은 담지 않는다 — 되나 안 되나만.
   */
  app.get("/api/health", async () => {
    const db: Record<string, unknown> = { ok: false };
    try {
      const 손 = getDb();
      db.tables = (손
        .prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'")
        .get() as { n: number }).n;
      db.sessionTable = !!손
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='keyserver_sessions'")
        .get();
      // 진짜로 써 본다. 디스크가 찼거나 읽기 전용이면 여기서 드러난다.
      손.prepare("CREATE TABLE IF NOT EXISTS _writecheck (at TEXT)").run();
      손.prepare("DELETE FROM _writecheck").run();
      db.writable = true;
      db.ok = true;
    } catch (err) {
      db.error = String((err as Error)?.message || err);
    }
    return {
      ok: true,
      // **이 서버가 언제 만든 코드로 돌고 있는가.**
      //
      // 고쳐 놓고 배포를 안 했는데 「왜 그대로지」 하며 딴 데를 파헤친
      // 일이 있었다. 배포가 먹었는지 아닌지를 눈으로 볼 수 있어야 한다.
      // (깃 번호를 쓰고 싶지만 `--source .` 배포에는 .git 이 안 올라간다.)
      builtAt: 만든때(),
      timezone: config.timezone,
      keyserver: config.keyserverUrl
        ? { set: true, program: config.keyserverProgram }
        : { set: false },
      db,
    };
  });

  // DASHBOARD_TOKEN이 설정된 경우에만 활성화되는 최소 방어선. 기본(로컬, 127.0.0.1
  // 바인딩 + 미설정)에서는 아무 영향이 없다. VPS/Cloud Run에서 대시보드를 직접
  // 노출해야 할 때 설정한다. 정적 파일(index.html/app.js/style.css)에는 민감한
  // 정보가 없으므로 걸지 않는다 — 걸면 app.js가 실행되기도 전에 막혀서, 클라이언트
  // 쪽 토큰 입력 프롬프트(app.js)가 아예 뜰 기회가 없어진다. 실제 데이터를 다루는
  // /api/* 요청만 토큰으로 보호한다.
  if (config.dashboardToken) {
    // 콜백 꼴(`done`)로 쓴다. async 가 아니다.
    //
    // 자리를 씌우려면 **요청의 나머지 전부**가 `자리에서(...)` 안에서
    // 돌아야 한다. async 훅은 자기가 끝나는 순간 자리도 같이 걷힌다 —
    // 그러면 정작 글을 읽고 쓰는 핸들러는 자리 밖에서 돌고, 칸막이가
    // 통째로 무용지물이 된다. `done` 을 자리 안에서 부르면 뒤따르는
    // 핸들러까지 그 자리 안이다.
    app.addHook("onRequest", (req, reply, done) => {
      if (!req.url.startsWith("/api/") || req.url === "/api/health") { done(); return; }
      // 로그인(키 교환) 자체는 아직 토큰이 없는 게 당연하므로 예외 처리한다.
      if (req.url.startsWith("/api/auth/redeem")) { done(); return; }
      // 세션 확인도 여기서 막으면 안 된다. 끊긴 기기에게 **왜** 끊겼는지
      // 말해 줄 수 있는 것은 그 길뿐인데, 여기서 막으면 "유효하지 않은
      // 대시보드 토큰입니다" 라는 엉뚱한 말이 대신 간다. 그 길은 세션값
      // 하나를 받아 살았는지만 답한다 — 막지 않아도 새는 것이 없다.
      if (req.url.startsWith("/api/auth/heartbeat")) { done(); return; }

      const header = req.headers["x-dashboard-token"];
      const query = (req.query as { token?: string } | undefined)?.token;
      const provided = (Array.isArray(header) ? header[0] : header) ?? query;

      // 주인은 마스터 토큰으로 들어온다. 주인의 자리는 owner_key = '' 다.
      if (provided === config.dashboardToken) { 자리에서(주인, done); return; }

      // 접속키로 통과한 사람. 그 사람의 1차키가 곧 자리다.
      const 세션 = provided ? findSession(provided) : null;
      if (!세션) {
        reply.code(401).send({ error: "유효하지 않은 대시보드 토큰입니다." });
        return;
      }
      // 키 서버가 admin 으로 준 키(= 이 서버를 산 분)는 주인과 같은 자리를
      // 쓴다. 자기 서버에 설치해 쓰는 사람이라 나눌 상대가 없다.
      // 체험이라고 **똑똑히 적힌** 것만 체험 자리로 보낸다. 역할을 모르면
      // 주인이다 — tenancy.ts 의 체험인가() 설명을 보라.
      const 누구: 쓰는이 = 세션.role !== 체험역할
        ? 주인
        : { ownerKey: 세션.key1, role: 세션.role };
      자리에서(누구, done);
    });
  }

  await app.register(categoriesRoutes);
  await app.register(queueRoutes);
  await app.register(historyRoutes);
  await app.register(manualRunRoutes);
  await app.register(postsRoutes);
  await app.register(settingsRoutes);
  await app.register(authRoutes);
  await app.register(imageDownloadsRoutes);
  await app.register(tenantsRoutes);

  await app.register(fastifyStatic, {
    root: path.join(import.meta.dirname, "public"),
    prefix: "/",
  });

  return app;
}
