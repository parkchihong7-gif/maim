import cron from "node-cron";
import { runDailyJob } from "./dailyJob.js";
import { runPublishTick } from "./publishRunner.js";
import { config } from "../config.js";

/**
 * dailyJob은 하루 1회(매일 06:00, 설정 타임존 기준), publishRunner는 5분마다 실행한다.
 * node-cron 표현식은 UTC가 아니라 옵션으로 넘긴 timezone 기준으로 해석된다.
 */
export function startScheduler(): void {
  cron.schedule("0 6 * * *", () => {
    runDailyJob().catch((err) => console.error("[cron] dailyJob 실행 중 오류:", err));
  }, { timezone: config.timezone });

  cron.schedule("*/5 * * * *", () => {
    runPublishTick().catch((err) => console.error("[cron] publishRunner 실행 중 오류:", err));
  }, { timezone: config.timezone });

  console.log(`[scheduler] 시작됨 (timezone=${config.timezone}) — dailyJob 매일 06:00, publishRunner 5분마다`);
}
