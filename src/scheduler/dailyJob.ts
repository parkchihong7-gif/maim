import { pickCategoriesForToday, updateCategory } from "../db/repositories/categories.js";
import { markReady } from "../db/repositories/posts.js";
import { assignDirectives } from "../pipeline/directives.js";
import { generatePost } from "../pipeline/generatePost.js";
import { attachImage } from "../pipeline/attachImage.js";
import { 죽은자리치우기 } from "./죽은자리치우기.js";

/**
 * 하루 1회 실행: 활성화된 모든 카테고리에 대해 콘텐츠+이미지를 생성해
 * 대시보드에서 바로 복사해갈 수 있는 'ready' 상태로 만든다. 실제 네이버 발행은
 * 사용자가 대시보드에서 내용을 복사해 직접 수행한다 (자동 발행 없음, 개수 제한 없음).
 */
export async function runDailyJob(): Promise<void> {
  // 기간이 끝난 체험 자리를 먼저 치운다. 글을 만들기 전에 해야 지울 것이
  // 늘지 않는다. 여기서 탈이 나도 오늘 글은 나와야 하므로 따로 감싼다.
  try {
    await 죽은자리치우기();
  } catch (err) {
    console.error("[dailyJob] 죽은 자리를 치우다 탈이 났습니다:", (err as Error).message);
  }

  const categories = pickCategoriesForToday();
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

      // 주제 키워드는 1회성 입력이므로 자동 생성에 쓰였어도 소진 처리한다.
      if (category.topic_keyword) {
        updateCategory(category.id, { topicKeyword: null });
      }

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
