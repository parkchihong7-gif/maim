import { buildServer } from "./web/server.js";
import { startScheduler } from "./scheduler/cron.js";
import { config } from "./config.js";
import { downloadState, uploadState } from "./persistence/gcsState.js";

async function main() {
  await downloadState();

  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
  startScheduler();

  if (config.gcsStateBucket) {
    // Cloud Run처럼 로컬 디스크가 콜드 스타트 사이에 사라지는 환경을 위해,
    // 주기적으로 + 종료 신호를 받으면 마지막으로 한 번 더 버킷에 백업한다.
    const interval = setInterval(() => {
      uploadState().catch((err) => console.error("[gcsState] 주기 업로드 실패:", err));
    }, 60_000);
    interval.unref();

    const shutdown = async () => {
      clearInterval(interval);
      try {
        await uploadState();
      } catch (err) {
        console.error("[gcsState] 종료 시 업로드 실패:", err);
      }
      process.exit(0);
    };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
