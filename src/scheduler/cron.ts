import cron from "node-cron";
import { runDailyJob } from "./dailyJob.js";
import { config } from "../config.js";
import { 지금시각, 크론식 } from "./예약.js";

/**
 * 매일 한 번 그날의 초안을 준비한다.
 *
 * **이것만으로는 Cloud Run 에서 안 돈다.** 이 프로그램은 아무도 안 쓸 때
 * 잠들고(그래서 요금이 0원이다), 잠든 프로세스 안의 시계는 멈춘다.
 * 그쪽에서는 **Cloud Scheduler** 가 밖에서 `/api/run/daily` 를 두드려야
 * 돈다 — 시각도 거기서 정해진다.
 *
 * 그럼 여기는 왜 두나. 늘 켜 두고 쓰는 판(집 서버·VPS·systemd)에서는
 * 이쪽이 진짜 자명종이다. 두 곳이 서로 다른 시각을 보면 헷갈리므로
 * **같은 설정값** 하나를 본다.
 */
let 일감: cron.ScheduledTask | null = null;

export function startScheduler(): void {
  걸기();
}

/** 시각 설정이 바뀌면 다시 건다. 안 그러면 다음에 서버를 껐다 켤 때까지 옛 시각이다. */
export function 다시걸기(): void {
  걸기();
}

function 걸기(): void {
  if (일감) {
    일감.stop();
    일감 = null;
  }
  const 시각 = 지금시각();
  일감 = cron.schedule(
    크론식(시각),
    () => {
      runDailyJob().catch((err) => console.error("[cron] dailyJob 실행 중 오류:", err));
    },
    { timezone: config.timezone },
  );
  console.log(`[scheduler] 매일 ${시각} 에 준비합니다 (timezone=${config.timezone}).`);
}
