import type { FastifyInstance } from "fastify";
import { getCategory, updateCategory } from "../../db/repositories/categories.js";
import { getPost, markReady } from "../../db/repositories/posts.js";
import { 체험인가, 지금주인, 체험_하루상한, 상한안내 } from "../../tenancy.js";
import { todayPostCount } from "../../db/repositories/tenants.js";
import { assignDirectives } from "../../pipeline/directives.js";
import { generatePost } from "../../pipeline/generatePost.js";
import { attachImage } from "../../pipeline/attachImage.js";
import { runDailyJob } from "../../scheduler/dailyJob.js";
import { 오류적기, 최근오류 } from "../../db/repositories/errorLog.js";
import { 주인자리인가 } from "../../tenancy.js";

export async function manualRunRoutes(app: FastifyInstance) {
  // Cloud Run처럼 평소 잠들어 있다가 요청이 와야만 깨어나는 배포에서는 서버 내부의
  // 매일 06:00 스케줄러(node-cron)가 그 시각에 프로세스가 꺼져 있으면 실행되지
  // 않는다. 이런 환경에서는 Cloud Scheduler 같은 외부 크론이 이 엔드포인트를
  // 매일 정해진 시각에 호출해 서버를 깨우고 초안 준비를 대신 트리거한다.
  // (server.ts의 대시보드 토큰 검증 훅이 이 라우트에도 그대로 적용된다.)
  app.post("/api/run/daily", async (req, reply) => {
    // 매일 작업은 **주인의 것**이다. 체험 회원이 부르면 이 서버의 카테고리
    // 전부를 한꺼번에 돌려, 하루 상한이 무의미해지고 주인의 Claude 한도를
    // 체험 한 사람이 다 써 버린다. 체험은 [지금 생성] 으로 한 편씩 만든다.
    if (체험인가()) {
      reply.code(403);
      return { error: "체험 키로는 전체 생성을 부를 수 없습니다. 카테고리에서 [지금 생성] 을 눌러 주세요." };
    }
    await runDailyJob();
    return { ok: true };
  });

  app.post("/api/run/generate", async (req, reply) => {
    // 체험은 하루 몇 편까지다. 글 한 편에 Claude 와 이미지 한도가 들어가는데,
    // 그건 이 서버를 세운 주인 몫에서 나간다. 맛보기에 필요한 만큼만 연다.
    if (체험인가()) {
      const 오늘 = todayPostCount(지금주인());
      if (오늘 >= 체험_하루상한) {
        reply.code(429);
        return { error: 상한안내(오늘), limit: 체험_하루상한, today: 오늘 };
      }
    }

    const { categoryId } = req.body as { categoryId: number };
    const category = getCategory(categoryId);
    if (!category) {
      reply.code(404);
      return { error: "카테고리를 찾을 수 없습니다." };
    }

    const [directive] = assignDirectives(1);
    let post;
    try {
      post = await generatePost(category, directive);
    } catch (탈) {
      // 적어 두고 그대로 돌려준다. 체험 회원 화면에 뜬 오류를 주인이
      // [관리자 설정 → 최근 오류] 에서 볼 수 있게 한다.
      오류적기("글쓰기", category.name, (탈 as Error).message);
      throw 탈;
    }

    // 주제 키워드는 "이번 한 번만" 우선 반영되는 1회성 입력이다. 생성에
    // 실제로 쓰였으니 다음 "지금 생성"이 같은 키워드로 또 반복되지 않도록
    // 여기서 자동으로 비운다.
    if (category.topic_keyword) {
      updateCategory(category.id, { topicKeyword: null });
    }

    try {
      await attachImage(post);
    } catch (err) {
      오류적기("이미지", category.name, (err as Error).message);
      markReady(post.id);
      return { ...getPost(post.id), imageError: (err as Error).message };
    }

    markReady(post.id);
    return getPost(post.id);
  });

  // 최근 오류. 주인은 전부(누구 자리에서 났는지까지), 체험 회원은 자기 것만.
  app.get("/api/errors", async () => {
    const 주인 = 주인자리인가();
    return { errors: 최근오류(주인), all: 주인 };
  });
}
