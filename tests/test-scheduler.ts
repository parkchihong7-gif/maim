/**
 * Phase 7 검증 스크립트.
 *
 * 캡=2, 발행 윈도우를 "지금부터 1분 뒤까지"로 축소해서 dailyJob -> publishRunner
 * 전체 흐름이 자동으로 도는지 확인한다. 실제 네이버 세션이 없으므로 마지막 발행
 * 단계는 "세션 없음"으로 실패하는 게 정상이며, 여기서는 그 앞단(카테고리 선정,
 * 랜덤 스케줄 시각 배정, 큐 등록, 예약 시각 도래 감지, 순차 발행 시도)이 올바르게
 * 동작하는지를 검증한다.
 *
 * 사용법: npx tsx tests/test-scheduler.ts
 */
import { DateTime } from "luxon";
import { setSetting, getAllSettings } from "../src/db/repositories/settings.js";
import { runDailyJob } from "../src/scheduler/dailyJob.js";
import { runPublishTick } from "../src/scheduler/publishRunner.js";
import { getDb } from "../src/db/index.js";
import { remainingDailyCapacity } from "../src/scheduler/queueManager.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const now = DateTime.now().setZone("Asia/Seoul");
  setSetting("postsPerDay", "2");
  setSetting("publishWindowStart", now.toFormat("HH:mm"));
  setSetting("publishWindowEnd", now.plus({ minutes: 1 }).toFormat("HH:mm"));
  console.log("축소된 설정:", getAllSettings());

  console.log("\n=== 1) dailyJob 실행 (카테고리 선정 + 이미지 생성 + 큐 등록) ===");
  await runDailyJob();

  const queued = getDb()
    .prepare("SELECT id, category_id, status, scheduled_at FROM posts WHERE status = 'queued'")
    .all();
  console.log("큐에 등록된 포스팅:", queued);
  console.log("남은 오늘의 캡:", remainingDailyCapacity());

  console.log("\n=== 2) 예약 시각까지 대기 후 publishRunner 틱 실행 ===");
  await sleep(65_000);

  await runPublishTick();
  await sleep(1000);
  await runPublishTick();

  const finalRows = getDb()
    .prepare("SELECT id, status, error_message FROM posts ORDER BY id")
    .all();
  console.log("\n최종 posts 상태:", finalRows);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
