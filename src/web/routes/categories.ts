import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  listAllCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../db/repositories/categories.js";
import {
  오늘목록, 오늘몇편, 지금차례, 차례정하기, 차례이름, 하루최대, 지금상한, 상한정하기, 카테고리상한,
  지금시각, 크론식,
  마지막으로돈때,
  type 차례,
} from "../../scheduler/예약.js";
import { 다시걸기 } from "../../scheduler/cron.js";
import { config } from "../../config.js";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";

/**
 * **지금 이 서버를 깨울 예약 작업을 만드는 명령**을 통째로 만들어 준다.
 *
 * 화면에는 「자동 준비가 꺼져 있습니다 — 설치 안내서 3-6 을 따라 걸어
 * 두십시오」 라고만 적혀 있었다. 경보는 맞는데, 거기서 고치기까지
 * **다섯 걸음**이 남는다 — 안내서를 찾고, 3-6 을 찾고, 주소와 암호를
 * 손으로 채우고, 지역을 맞추고, 붙여넣는다. 그래서 안 하게 된다.
 * 실제로 그렇게 아침에 글이 안 나왔다.
 *
 * 주소·지역·서비스 이름·시각은 **이 서버가 이미 안다.** 들어온 요청의
 * 호스트에서 꺼내 쓰면 된다. 모르는 것은 암호 하나뿐이라, 그것만
 * 물어보게 하고 나머지는 다 채운다.
 *
 * 암호는 **명령 글에 넣지 않는다.** 화면은 여러 사람이 보고, 명령은
 * 기록에 남는다.
 */
function 예약만들기명령(req: FastifyRequest): string {
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "");
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  const 주소 = host ? `${proto}://${host}` : "https://사장님-서비스-URL";
  // maim-1048530680370.us-central1.run.app → us-central1
  const 맞은것 = host.match(/\.([a-z]+-[a-z]+\d+)\.run\.app$/);
  const 지역 = 맞은것 ? 맞은것[1] : "us-central1";
  const 이름 = `${process.env.K_SERVICE || "maim"}-daily`;
  return `read -rsp "대시보드 암호를 붙여넣고 Enter: " T; echo; `
       + `gcloud scheduler jobs create http ${이름} `
       + `--location=${지역} `
       + `--schedule="${크론식()}" `
       + `--time-zone="${config.timezone}" `
       + `--uri="${주소}/api/run/daily" `
       + `--http-method=POST `
       + `--attempt-deadline=1800s `
       + `--headers="x-dashboard-token=$T"`;
}

export async function categoriesRoutes(app: FastifyInstance) {
  app.get("/api/categories", async () => listAllCategories());

  // ── 포스팅 예약 설정 ──────────────────────────────────────────
  //
  // 화면이 «지금 이대로면 내일 아침에 무엇이 몇 편 나오는가» 를 그대로
  // 보여 줄 수 있어야 한다. 설정만 있고 결과가 안 보이면, 맞게 넣었는지
  // 다음 날 아침까지 알 수가 없다.
  app.get("/api/schedule", async (req) => {
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
      // 「꺼져 있습니다」 만 말하지 말고, 켜는 명령을 같이 준다.
      setupCommand: 주인자리인가() ? 예약만들기명령(req) : "",
      // 시각은 **못 박혀 있다.** 화면은 보여 주기만 한다 — 예약.ts 참고.
      time: 지금시각(),
      cron: 크론식(),
      preview: 오늘목록(방식).map((h) => ({
        categoryId: h.category.id, name: h.category.name, nth: h.nth,
      })),
    };
  });

  app.put("/api/schedule", async (req, reply) => {
    // 이건 **서버 한 대의 시간표**다. 자리마다 갈라져 있지 않아서,
    // 체험 회원이 고치면 사장님 아침 글의 시각이 바뀐다.
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    // 시각은 여기서 안 받는다. 06:00 으로 못 박혀 있고, 바꿀 수 없으면
    // 밖의 자명종과 어긋날 수도 없다 — 예약.ts 의 발행시각 설명을 보라.
    const { order, dailyCap } = (req.body ?? {}) as
      { order?: string; dailyCap?: number };

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

    return { ok: true, dailyCap: 지금상한(), time: 지금시각(), cron: 크론식() };
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
