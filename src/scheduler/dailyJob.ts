import { pickCategoriesForToday } from "../db/repositories/categories.js";
import { getAllSettings } from "../db/repositories/settings.js";
import { markReady } from "../db/repositories/posts.js";
import { assignDirectives } from "../pipeline/directives.js";
import { generatePost } from "../pipeline/generatePost.js";
import { attachImage } from "../pipeline/attachImage.js";
import { remainingDailyCapacity } from "./queueManager.js";
import { config } from "../config.js";

/**
 * 하루 1회 실행: 오늘 생성할 카테고리를 고르고, 카테고리별로 콘텐츠+이미지를 생성해
 * 대시보드에서 바로 복사해갈 수 있는 'ready' 상태로 만든다. 실제 네이버 발행은
 * 사용자가 대시보드에서 내용을 복사해 직접 수행한다 (자동 발행 없음).
 */
export async function runDailyJob(): Promise<void> {
  const settings = getAllSettings();
  const configuredPostsPerDay = Number(settings.postsPerDay) || config.postsPerDay;
  const remaining = remainingDailyCapacity(configuredPostsPerDay);

  if (remaining <= 0) {
    console.log("[dailyJob] 오늘 생성 캡을 이미 모두 사용했습니다. 건너뜁니다.");
    return;
  }

  const categories = pickCategoriesForToday(remaining);
  const n = categories.length;
  if (n === 0) {
    console.log("[dailyJob] 활성 카테고리가 없습니다. 건너뜁니다.");
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

      markReady(post.id);
      console.log(`[dailyJob] 준비 완료: postId=${post.id}, category=${category.name}`);
    } catch (err) {
      console.error(`[dailyJob] 카테고리 "${category.name}" 생성 실패, 건너뜀:`, (err as Error).message);
    }
  }
}
