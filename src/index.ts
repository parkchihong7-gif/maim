import { buildServer } from "./web/server.js";
import { startScheduler } from "./scheduler/cron.js";
import { config } from "./config.js";

async function main() {
  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
  startScheduler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
