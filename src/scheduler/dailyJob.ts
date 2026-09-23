import { updateCategory } from "../db/repositories/categories.js";
import { 오늘목록, 지금차례, 차례이름, 돌았다고적기 } from "./예약.js";
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
  // **언제 마지막으로 돌았는지 적어 둔다.**
  //
  // 이 서버는 스스로 못 깨어난다 — Cloud Scheduler 가 두드려야 돈다.
  // 그걸 안 걸어 두면 설정은 멀쩡한데 아침에 아무 일도 안 일어나고,
  // 무엇이 잘못됐는지 알 길이 없다. 여기 적어 두면 화면이 «자동 준비가
  // 꺼져 있습니다» 라고 먼저 말해 줄 수 있다.
  돌았다고적기();

  // 기간이 끝난 체험 자리를 먼저 치운다. 글을 만들기 전에 해야 지울 것이
  // 늘지 않는다. 여기서 탈이 나도 오늘 글은 나와야 하므로 따로 감싼다.
  try {
    await 죽은자리치우기();
  } catch (err) {
    console.error("[dailyJob] 죽은 자리를 치우다 탈이 났습니다:", (err as Error).message);
  }

  // **예약 설정대로** 오늘 만들 목록을 펼친다. 예전에는 활성 카테고리를
  // 전부 한 편씩 돌렸는데, 카테고리가 아홉이면 매일 아홉 편이 나왔다.
  // 그만큼 올리는 사람은 없어서 쌓이기만 하고 한도만 축냈다.
  const 방식 = 지금차례();
  const 할일 = 오늘목록(방식);
  const n = 할일.length;
  if (n === 0) {
    console.log("[dailyJob] 오늘 만들 것이 없습니다 — 쓸 카테고리가 없거나 "
              + "하루 편수가 전부 0 입니다.");
    return;
  }
  console.log(`[dailyJob] ${차례이름[방식]} · 오늘 ${n}편 준비합니다.`);

  const directives = assignDirectives(n);

  for (let i = 0; i < n; i++) {
    const category = 할일[i].category;
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
