import Fastify from "fastify";
import { config } from "./config.js";

async function main() {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => ({
    ok: true,
    deploymentMode: config.deploymentMode,
    timezone: config.timezone,
  }));

  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
