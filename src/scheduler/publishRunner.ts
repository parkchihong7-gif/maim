import { DateTime } from "luxon";
import { listDuePosts } from "../db/repositories/posts.js";
import { publishPost } from "../naver/publisher.js";

let running = false;

/**
 * 예약 시각이 도래한 포스팅을 한 번에 하나씩만 발행한다 (동시성 없음, 사람처럼 순차 처리).
 * 실제 발행 직전 0~3분의 추가 지터를 둬서 정확히 cron 틱에 맞춰 발행되지 않도록 한다.
 */
export async function runPublishTick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const nowIso = DateTime.utc().toISO()!;
    const due = listDuePosts(nowIso);
    if (due.length === 0) return;

    const post = due[0];
    const jitterMs = Math.random() * 3 * 60 * 1000;
    await new Promise((resolve) => setTimeout(resolve, jitterMs));

    try {
      await publishPost(post);
      console.log(`[publishRunner] 발행 성공: postId=${post.id}`);
    } catch (err) {
      console.error(`[publishRunner] 발행 실패: postId=${post.id}:`, (err as Error).message);
    }
  } finally {
    running = false;
  }
}
