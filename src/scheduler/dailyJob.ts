import { pickCategoriesForToday } from "../db/repositories/categories.js";
import { getAllSettings } from "../db/repositories/settings.js";
import { queuePost } from "../db/repositories/posts.js";
import { assignDirectives } from "../pipeline/directives.js";
import { generatePost } from "../pipeline/generatePost.js";
import { attachImage } from "../pipeline/attachImage.js";
import { remainingDailyCapacity, computeRandomScheduleTimes } from "./queueManager.js";
import { config } from "../config.js";

/**
 * 하루 1회 실행: 오늘 생성할 카테고리를 고르고, 랜덤 예약 발행 시각을 배정한 뒤
 * 카테고리별로 콘텐츠+이미지를 생성해 큐에 등록한다. 실제 발행은 publishRunner가 담당한다.
 */
export async function runDailyJob(): Promise<void> {
  const settings = getAllSettings();
  const configuredPostsPerDay = Number(settings.postsPerDay) || config.postsPerDay;
  const remaining = remainingDailyCapacity(configuredPostsPerDay);

  if (remaining <= 0) {
    console.log("[dailyJob] 오늘 발행 캡을 이미 모두 사용했습니다. 건너뜁니다.");
    return;
  }

  const categories = pickCategoriesForToday(remaining);
  const n = categories.length;
  if (n === 0) {
    console.log("[dailyJob] 활성 카테고리가 없습니다. 건너뜁니다.");
    return;
  }

  let scheduleTimes;
  try {
    scheduleTimes = computeRandomScheduleTimes(
      n,
      settings.publishWindowStart,
      settings.publishWindowEnd,
      config.timezone,
    );
  } catch (err) {
    console.error("[dailyJob] 발행 윈도우 계산 실패:", (err as Error).message);
    return;
  }

  const directives = assignDirectives(n);

  for (let i = 0; i < n; i++) {
    const category = categories[i];
    try {
      const post = await generatePost(category, directives[i]);

      try {
        await attachImage(post);
      } catch (err) {
        console.warn(`[dailyJob] 이미지 부착 실패 (postId=${post.id}):`, (err as Error).message);
      }

      const scheduledAtIso = scheduleTimes[i].toUTC().toISO()!;
      queuePost(post.id, scheduledAtIso);
      console.log(
        `[dailyJob] 큐 등록: postId=${post.id}, category=${category.name}, scheduledAt=${scheduledAtIso}`,
      );
    } catch (err) {
      console.error(`[dailyJob] 카테고리 "${category.name}" 생성 실패, 건너뜀:`, (err as Error).message);
    }
  }
}
