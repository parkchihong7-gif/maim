/**
 * dailyJob 검증 스크립트.
 *
 * 캡을 2로 축소해서 dailyJob이 카테고리를 골라 콘텐츠+이미지를 생성하고
 * 'ready' 상태로 만드는지, 그리고 하루 생성 캡이 정확히 차감되는지 확인한다.
 * (실제 네이버 발행은 사용자가 대시보드에서 직접 복사해 수행하므로 여기서는
 * 다루지 않는다.)
 *
 * 사용법: npx tsx tests/test-scheduler.ts
 */
import { setSetting, getAllSettings } from "../src/db/repositories/settings.js";
import { runDailyJob } from "../src/scheduler/dailyJob.js";
import { getDb } from "../src/db/index.js";
import { remainingDailyCapacity } from "../src/scheduler/queueManager.js";

async function main() {
  setSetting("postsPerDay", "2");
  console.log("축소된 설정:", getAllSettings());

  console.log("\n=== dailyJob 실행 (카테고리 선정 + 콘텐츠/이미지 생성) ===");
  await runDailyJob();

  const ready = getDb()
    .prepare("SELECT id, category_id, status, title FROM posts WHERE status = 'ready'")
    .all();
  console.log("준비된 포스팅:", ready);
  console.log("남은 오늘의 캡 (0이어야 정상):", remainingDailyCapacity());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
