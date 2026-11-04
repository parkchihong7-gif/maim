import { buildServer } from "./web/server.js";
import { startScheduler } from "./scheduler/cron.js";
import { config } from "./config.js";
import { downloadEssentialState, downloadState, uploadState } from "./persistence/gcsState.js";

async function main() {
  // DB만 먼저 받는다 — 화면·카테고리·이력을 보는 데 필요한 전부다. 로그인
  // 폴더(home/)는 AI 로 실제로 글을 쓸 때만 필요하고, 그건 src/ai/run.ts 가
  // 부르기 바로 전에 알아서 받아 온다. 여기서 같이 기다리게 하면 로그인
  // 폴더가 무거울 때 화면 자체가 몇 분씩 안 열린다 — 그 문제를 직접 겪었다.
  await downloadEssentialState();

  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
  startScheduler();

  // 나머지(로그인 폴더 등)는 화면이 열린 뒤 백그라운드로 마저 받는다.
  // 끝나기 전에 AI 를 부르면 run.ts 의 로그인맞추기()가 그 자리에서 알아서 받으므로
  // 여기서 실패하거나 늦어도 괜찮다.
  downloadState().catch((err) => console.error("[gcsState] 시작 후 나머지 복원 실패:", err));

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
