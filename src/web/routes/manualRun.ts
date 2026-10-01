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
import { 쓸수있나, 지금상태, type AI상태 } from "../../ai/run.js";
import { 이미지키들 } from "../../db/repositories/settings.js";

/** 무료 이미지 키가 하나도 없을 때. 화면은 `needsImages` 를 보고 키 넣는 자리로 데려간다. */
function 이미지없는답(주인: boolean) {
  return {
    needsImages: true,
    error: 주인
      ? "무료 이미지 사이트 API 키가 하나도 없습니다. 키가 없어도 글은 나오지만 사진이 안 붙습니다. "
        + "[관리자 설정 → 1) AI 커넥트 연결] 의 Unsplash · Pexels · Pixabay 중 하나 이상 키를 넣은 뒤 이용해 주세요 "
        + "(셋 다 무료, 가입하면 바로 나옵니다)."
      : "지금은 사진을 찾아 올 무료 이미지 키가 설정되어 있지 않아 글을 만들 수 없습니다. "
        + "보내 주신 분께 «이미지 키가 없다» 고 알려 주세요. 오늘 한도는 줄지 않았습니다.",
  };
}

/**
 * AI 가 **끊긴 것이 분명하면** 글을 만들러 가지 않는다.
 *
 * 가 봐야 몇 분 뒤 영문 오류만 받는다. 체험 회원은 그 한 번으로 하루 한도를
 * 잃는다. 주인에게는 무엇을 고치면 되는지, 체험 회원에게는 누구에게 알리면
 * 되는지 말한다. 화면은 `needsAi` 를 보고 [관리자 설정] 으로 데려간다.
 */
function 막힌답(상태: AI상태, 주인: boolean) {
  return {
    needsAi: true,
    engine: 상태.label,
    error: 주인
      ? `글 쓸 AI(${상태.label})가 연결되어 있지 않습니다 — ${상태.why || "연결 테스트가 실패했습니다."} `
        + `[관리자 설정 → 1) AI 커넥트 연결] 에서 고치신 뒤 [연결 테스트] 를 눌러 주세요.`
      : `지금은 글 쓸 AI 연결이 끊겨 있어 글을 만들 수 없습니다. `
        + `보내 주신 분께 «AI 연결이 끊겼다» 고 알려 주세요. 오늘 한도는 줄지 않았습니다.`,
  };
}

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
    const 상태 = await 쓸수있나();
    if (상태.ok === false) { reply.code(409); return 막힌답(상태, true); }
    if (이미지키들().count === 0) { reply.code(409); return 이미지없는답(true); }
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

    const 상태 = await 쓸수있나();
    if (상태.ok === false) { reply.code(409); return 막힌답(상태, 주인자리인가()); }
    if (이미지키들().count === 0) { reply.code(409); return 이미지없는답(주인자리인가()); }

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
    // [계속 유지] 를 켜 둔 카테고리는 비우지 않는다.
    if (category.topic_keyword && !category.keyword_keep) {
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

  // 화면 맨 위 상태 막대가 부른다. 체험 회원에게는 까닭의 속사정(명령·경로)은
  // 빼고 «되는가 안 되는가» 만 준다.
  app.get("/api/ai/status", async () => {
    const 주인 = 주인자리인가();
    const 상태 = 지금상태();
    return {
      ...상태,
      why: 주인 ? 상태.why : (상태.ok === false ? "AI 연결이 끊겨 있습니다." : ""),
      changed: 주인 ? 상태.changed : null,
      role: 주인 ? "admin" : "client",
      // 무료 이미지 키. 체험 회원에게는 몇 개인지만.
      images: 주인 ? 이미지키들() : { count: 이미지키들().count, total: 3, set: [], missing: [] },
    };
  });

  // 화면이 «끊김» 을 보고 막기 전에 부른다. 적힌 것이 오래됐으면 서버가 한 번
  // 직접 확인하고 새 상태를 돌려준다 — 옛 기록 하나로 멀쩡한 AI 를 막지 않게.
  app.post("/api/ai/check", async () => {
    const 주인 = 주인자리인가();
    const 상태 = await 쓸수있나();
    return {
      ...상태,
      why: 주인 ? 상태.why : (상태.ok === false ? "AI 연결이 끊겨 있습니다." : ""),
      changed: 주인 ? 상태.changed : null,
      role: 주인 ? "admin" : "client",
      images: 주인 ? 이미지키들() : { count: 이미지키들().count, total: 3, set: [], missing: [] },
    };
  });

  // 최근 오류. 주인은 전부(누구 자리에서 났는지까지), 체험 회원은 자기 것만.
  app.get("/api/errors", async () => {
    const 주인 = 주인자리인가();
    return { errors: 최근오류(주인), all: 주인 };
  });
}
