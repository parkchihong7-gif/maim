import { buildServer } from "./web/server.js";
import { config } from "./config.js";

async function main() {
  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
