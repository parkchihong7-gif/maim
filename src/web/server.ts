import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { config } from "../config.js";
import { categoriesRoutes } from "./routes/categories.js";
import { queueRoutes } from "./routes/queue.js";
import { historyRoutes } from "./routes/history.js";
import { manualRunRoutes } from "./routes/manualRun.js";
import { postsRoutes } from "./routes/posts.js";
import { settingsRoutes } from "./routes/settings.js";
import { authRoutes } from "./routes/auth.js";
import { imageDownloadsRoutes } from "./routes/imageDownloads.js";
import { isValidGuestSessionToken } from "../db/repositories/accessCodes.js";

export async function buildServer() {
  // 대시보드가 15초마다 자동 새로고침하면서 여러 API를 호출하는데, 매 요청마다
  // "incoming request"/"request completed" 로그가 찍히면 터미널이 너무 시끄러워진다.
  // 에러/경고는 그대로 로그에 남기고, 정상 요청 단위 로그만 끈다.
  const app = Fastify({ logger: true, disableRequestLogging: true });

  app.get("/api/health", async () => ({
    ok: true,
    timezone: config.timezone,
  }));

  // DASHBOARD_TOKEN이 설정된 경우에만 활성화되는 최소 방어선. 기본(로컬, 127.0.0.1
  // 바인딩 + 미설정)에서는 아무 영향이 없다. VPS/Cloud Run에서 대시보드를 직접
  // 노출해야 할 때 설정한다. 정적 파일(index.html/app.js/style.css)에는 민감한
  // 정보가 없으므로 걸지 않는다 — 걸면 app.js가 실행되기도 전에 막혀서, 클라이언트
  // 쪽 토큰 입력 프롬프트(app.js)가 아예 뜰 기회가 없어진다. 실제 데이터를 다루는
  // /api/* 요청만 토큰으로 보호한다.
  if (config.dashboardToken) {
    app.addHook("onRequest", async (req, reply) => {
      if (!req.url.startsWith("/api/") || req.url === "/api/health") return;
      // 로그인(코드 교환) 자체는 아직 토큰이 없는 게 당연하므로 예외 처리한다.
      if (req.url.startsWith("/api/auth/redeem")) return;
      const header = req.headers["x-dashboard-token"];
      const query = (req.query as { token?: string } | undefined)?.token;
      const provided = (Array.isArray(header) ? header[0] : header) ?? query;
      // 마스터 토큰이거나, 1회용 게스트 코드를 교환해 발급받은 세션 토큰이면 통과.
      if (provided !== config.dashboardToken && !(provided && isValidGuestSessionToken(provided))) {
        reply.code(401).send({ error: "유효하지 않은 대시보드 토큰입니다." });
      }
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

  await app.register(fastifyStatic, {
    root: path.join(import.meta.dirname, "public"),
    prefix: "/",
  });

  return app;
}
