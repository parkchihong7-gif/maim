import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { config } from "../config.js";
import { categoriesRoutes } from "./routes/categories.js";
import { queueRoutes } from "./routes/queue.js";
import { historyRoutes } from "./routes/history.js";
import { settingsRoutes } from "./routes/settings.js";
import { authRoutes } from "./routes/auth.js";
import { manualRunRoutes } from "./routes/manualRun.js";

export async function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => ({
    ok: true,
    deploymentMode: config.deploymentMode,
    timezone: config.timezone,
  }));

  await app.register(categoriesRoutes);
  await app.register(queueRoutes);
  await app.register(historyRoutes);
  await app.register(settingsRoutes);
  await app.register(authRoutes);
  await app.register(manualRunRoutes);

  await app.register(fastifyStatic, {
    root: path.join(import.meta.dirname, "public"),
    prefix: "/",
  });

  return app;
}
