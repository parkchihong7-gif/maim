import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { config } from "../config.js";
import { categoriesRoutes } from "./routes/categories.js";
import { queueRoutes } from "./routes/queue.js";
import { historyRoutes } from "./routes/history.js";
import { manualRunRoutes } from "./routes/manualRun.js";
import { postsRoutes } from "./routes/posts.js";

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
  // 바인딩 + 미설정)에서는 아무 영향이 없다. VPS에서 SSH 터널을 쓸 수 없어 대시보드를
  // 부득이 직접 노출해야 할 때만 설정할 것.
  if (config.dashboardToken) {
    app.addHook("onRequest", async (req, reply) => {
      if (req.url === "/api/health") return;
      const header = req.headers["x-dashboard-token"];
      const query = (req.query as { token?: string } | undefined)?.token;
      const provided = (Array.isArray(header) ? header[0] : header) ?? query;
      if (provided !== config.dashboardToken) {
        reply.code(401).send({ error: "유효하지 않은 대시보드 토큰입니다." });
      }
    });
  }

  await app.register(categoriesRoutes);
  await app.register(queueRoutes);
  await app.register(historyRoutes);
  await app.register(manualRunRoutes);
  await app.register(postsRoutes);

  await app.register(fastifyStatic, {
    root: path.join(import.meta.dirname, "public"),
    prefix: "/",
  });

  return app;
}
