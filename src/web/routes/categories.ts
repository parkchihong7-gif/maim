import type { FastifyInstance } from "fastify";
import {
  listAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../db/repositories/categories.js";
import {
  오늘목록, 오늘몇편, 지금차례, 차례정하기, 차례이름, 하루최대, 지금상한, 상한정하기, 카테고리상한,
  마지막으로돈때,
  type 차례,
} from "../../scheduler/예약.js";

export async function categoriesRoutes(app: FastifyInstance) {
  app.get("/api/categories", async () => listAllCategories());

  // ── 포스팅 예약 설정 ──────────────────────────────────────────
  //
  // 화면이 «지금 이대로면 내일 아침에 무엇이 몇 편 나오는가» 를 그대로
  // 보여 줄 수 있어야 한다. 설정만 있고 결과가 안 보이면, 맞게 넣었는지
  // 다음 날 아침까지 알 수가 없다.
  app.get("/api/schedule", async () => {
    const 방식 = 지금차례();
    const { 계획, 잘림, 상한 } = 오늘몇편(방식);
    return {
      order: 방식,
      orderLabel: 차례이름[방식],
      orders: (Object.keys(차례이름) as 차례[]).map((k) => ({ id: k, label: 차례이름[k] })),
      dailyCap: 상한,
      dailyCapMax: 하루최대,
      perCategoryCap: 카테고리상한,
      planned: 계획,
      trimmed: 잘림,
      // 자명종(Cloud Scheduler)이 걸렸는지 서버가 직접 알 길은 없다.
      // 대신 **마지막으로 돈 때**를 돌려준다. 한 번도 안 돌았거나 하루하고
      // 반나절이 넘었으면 화면이 «꺼져 있습니다» 라고 말한다.
      lastRun: 마지막으로돈때(),
      preview: 오늘목록(방식).map((h) => ({
        categoryId: h.category.id, name: h.category.name, nth: h.nth,
      })),
    };
  });

  app.put("/api/schedule", async (req, reply) => {
    const { order, dailyCap } = (req.body ?? {}) as { order?: string; dailyCap?: number };

    if (order !== undefined) {
      if (order !== "sequential" && order !== "random" && order !== "least_used") {
        reply.code(400);
        return { error: "차례는 sequential · random · least_used 중 하나여야 합니다." };
      }
      차례정하기(order);
    }

    if (dailyCap !== undefined) {
      const n = Number(dailyCap);
      if (!Number.isFinite(n)) {
        reply.code(400);
        return { error: "하루 건수는 숫자여야 합니다." };
      }
      // 넘겨도 튕기지 않고 **깎아서** 받는다. 11 을 넣었다고 저장이 통째로
      // 실패하면, 무엇이 잘못됐는지 모른 채 눌러 보기만 하게 된다.
      if (n > 하루최대 || n < 0) {
        const 맞춘 = 상한정하기(n);
        return { ok: true, dailyCap: 맞춘,
                 notice: `하루 건수는 0~${하루최대} 사이라 ${맞춘}건으로 맞췄습니다.` };
      }
      상한정하기(n);
    }

    return { ok: true, dailyCap: 지금상한() };
  });

  app.post("/api/categories", async (req, reply) => {
    const body = req.body as {
      name: string;
      requiresSearch: boolean;
      promptHint: string;
      topicKeyword?: string | null;
      dailyCount?: number;
    };
    const category = createCategory(body);
    reply.code(201);
    return category;
  });

  app.put("/api/categories/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    updateCategory(
      id,
      req.body as Partial<{
        name: string;
        requiresSearch: boolean;
        promptHint: string;
        active: boolean;
        topicKeyword: string | null;
        dailyCount: number;
      }>,
    );
    return { ok: true };
  });

  app.delete("/api/categories/:id", async (req) => {
    const id = Number((req.params as { id: string }).id);
    deleteCategory(id);
    return { ok: true };
  });
}
