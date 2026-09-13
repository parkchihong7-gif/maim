import cron from "node-cron";
import { runDailyJob } from "./dailyJob.js";
import { config } from "../config.js";

/** dailyJob은 하루 1회(매일 06:00, 설정 타임존 기준) 실행되어 그날의 초안을 준비한다. */
export function startScheduler(): void {
  cron.schedule(
    "0 6 * * *",
    () => {
      runDailyJob().catch((err) => console.error("[cron] dailyJob 실행 중 오류:", err));
    },
    { timezone: config.timezone },
  );

  console.log(`[scheduler] 시작됨 (timezone=${config.timezone}) — dailyJob 매일 06:00`);
}
