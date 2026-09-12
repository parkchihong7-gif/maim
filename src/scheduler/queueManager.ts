import { DateTime } from "luxon";
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

/**
 * 발행 윈도우를 n구간으로 나누고, 각 구간 안에서 지터를 준 랜덤 시각을 배정한다.
 * 클러스터링(몰림) 없이 자연스럽게 분산된 예약 발행 시각을 만들기 위함.
 */
export function computeRandomScheduleTimes(
  n: number,
  windowStart: string,
  windowEnd: string,
  timezone: string,
): DateTime[] {
  if (n <= 0) return [];

  const today = DateTime.now().setZone(timezone).startOf("day");
  const [startH, startM] = windowStart.split(":").map(Number);
  const [endH, endM] = windowEnd.split(":").map(Number);
  const start = today.set({ hour: startH, minute: startM, second: 0, millisecond: 0 });
  const end = today.set({ hour: endH, minute: endM, second: 0, millisecond: 0 });

  const totalMs = end.diff(start).as("milliseconds");
  if (totalMs <= 0) {
    throw new Error(`발행 윈도우가 올바르지 않습니다: ${windowStart} ~ ${windowEnd}`);
  }

  const bucketMs = totalMs / n;
  const times: DateTime[] = [];
  for (let i = 0; i < n; i++) {
    const bucketStart = start.plus({ milliseconds: bucketMs * i });
    const jitterMs = Math.random() * bucketMs;
    times.push(bucketStart.plus({ milliseconds: jitterMs }));
  }
  return times.sort((a, b) => a.toMillis() - b.toMillis());
}
