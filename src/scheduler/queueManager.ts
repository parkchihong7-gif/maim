import { countTodayCommitted } from "../db/repositories/posts.js";
import { config } from "../config.js";

/** 설정된 하루 발행 개수와 무관하게, 5개/일 하드 캡을 항상 우선 적용한다. */
export function effectiveDailyCap(configuredPostsPerDay: number): number {
  return Math.min(configuredPostsPerDay, config.dailyHardCap);
}

export function remainingDailyCapacity(configuredPostsPerDay = config.postsPerDay): number {
  const cap = effectiveDailyCap(configuredPostsPerDay);
  const used = countTodayCommitted();
  return Math.max(0, cap - used);
}

/** 캡 초과 시 예외를 던진다. 수동 트리거와 스케줄러 모두 반드시 이 체크를 거쳐야 한다. */
export function assertUnderDailyCap(configuredPostsPerDay = config.postsPerDay): void {
  if (remainingDailyCapacity(configuredPostsPerDay) <= 0) {
    throw new Error(
      `오늘 발행 가능 횟수(최대 ${effectiveDailyCap(configuredPostsPerDay)}개)를 모두 사용했습니다.`,
    );
  }
}
