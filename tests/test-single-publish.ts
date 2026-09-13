/**
 * Phase 5 검증 스크립트 (사용자가 로컬 PC에서 실행해야 함).
 *
 * 전제 조건: `npm run login`으로 네이버 로그인을 먼저 완료해야 한다.
 * 이 스크립트는 draft 포스팅 하나를 생성 -> 이미지 부착 -> 실제 예약 발행까지
 * end-to-end로 시도한다. 셀렉터가 selectors.ts의 추정치와 다르면 여기서 실패하며,
 * 에러 메시지와 함께 data/generated/<postId>/error.png 스크린샷이 남는다.
 * 그 스크린샷/실제 DOM을 보고 selectors.ts를 갱신해야 한다.
 *
 * 사용법: PLAYWRIGHT_HEADLESS=false npx tsx tests/test-single-publish.ts
 */
import { DateTime } from "luxon";
import { listActiveCategories } from "../src/db/repositories/categories.js";
import { assignDirectives } from "../src/pipeline/directives.js";
import { generatePost } from "../src/pipeline/generatePost.js";
import { attachImage } from "../src/pipeline/attachImage.js";
import { queuePost, getPost } from "../src/db/repositories/posts.js";
import { publishPost } from "../src/naver/publisher.js";
import { hasSavedSession } from "../src/naver/browserContext.js";
import { config } from "../src/config.js";

async function main() {
  if (!hasSavedSession()) {
    console.error("저장된 네이버 세션이 없습니다. 먼저 `npm run login`을 실행하세요.");
    process.exit(1);
  }

  const category = listActiveCategories().find((c) => c.requires_search === 0) ?? listActiveCategories()[0];
  console.log(`테스트 카테고리: ${category.name}`);

  const [directive] = assignDirectives(1);
  const post = await generatePost(category, directive);
  console.log(`draft 포스팅 생성 완료: id=${post.id}, title=${post.title}`);

  await attachImage(post);
  console.log("이미지 부착 완료");

  const scheduledAt = DateTime.now().setZone(config.timezone).plus({ minutes: 10 }).toUTC().toISO()!;
  queuePost(post.id, scheduledAt);
  console.log(`예약 발행 시각: ${scheduledAt}`);

  // attachImage()는 DB의 posts.image_path만 갱신하고 메모리의 post 객체는
  // 그대로이므로, 반드시 DB에서 다시 읽어와야 image_path가 채워진 최신 값을 쓴다.
  const refreshed = { ...getPost(post.id)!, scheduled_at: scheduledAt };
  await publishPost(refreshed);
  console.log("발행 성공! 네이버 블로그 관리 페이지에서 예약글 목록을 확인하세요.");
}

main().catch((err) => {
  console.error("발행 실패:", err);
  process.exit(1);
});
