import type { FastifyInstance } from "fastify";
import { getCategory, updateCategory } from "../../db/repositories/categories.js";
import { getPost, markReady } from "../../db/repositories/posts.js";
import { assignDirectives } from "../../pipeline/directives.js";
import { generatePost } from "../../pipeline/generatePost.js";
import { attachImage } from "../../pipeline/attachImage.js";
import { runDailyJob } from "../../scheduler/dailyJob.js";

export async function manualRunRoutes(app: FastifyInstance) {
  // Cloud Run처럼 평소 잠들어 있다가 요청이 와야만 깨어나는 배포에서는 서버 내부의
  // 매일 06:00 스케줄러(node-cron)가 그 시각에 프로세스가 꺼져 있으면 실행되지
  // 않는다. 이런 환경에서는 Cloud Scheduler 같은 외부 크론이 이 엔드포인트를
  // 매일 정해진 시각에 호출해 서버를 깨우고 초안 준비를 대신 트리거한다.
  // (server.ts의 대시보드 토큰 검증 훅이 이 라우트에도 그대로 적용된다.)
  app.post("/api/run/daily", async () => {
    await runDailyJob();
    return { ok: true };
  });

  app.post("/api/run/generate", async (req, reply) => {
    const { categoryId } = req.body as { categoryId: number };
    const category = getCategory(categoryId);
    if (!category) {
      reply.code(404);
      return { error: "카테고리를 찾을 수 없습니다." };
    }

    const [directive] = assignDirectives(1);
    const post = await generatePost(category, directive);

    // 주제 키워드는 "이번 한 번만" 우선 반영되는 1회성 입력이다. 생성에
    // 실제로 쓰였으니 다음 "지금 생성"이 같은 키워드로 또 반복되지 않도록
    // 여기서 자동으로 비운다.
    if (category.topic_keyword) {
      updateCategory(category.id, { topicKeyword: null });
    }

    try {
      await attachImage(post);
    } catch (err) {
      markReady(post.id);
      return { ...getPost(post.id), imageError: (err as Error).message };
    }

    markReady(post.id);
    return getPost(post.id);
  });
}
