/**
 * 🔎 네이버 키워드 탭의 API. **주인 자리만** 쓴다 — 체험 키는 403.
 * (사장님 네이버 키 한도를 쓰는 자리다.)
 *
 * 여기 있는 것은 모두 글쓰기와 따로 돈다. 글쓰기는 보관함을 읽기만 한다
 * (src/naver/보관함사용.ts).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { 블로그검색 } from "../../naver/블로그검색.js";
import { 연관키워드 } from "../../naver/검색광고.js";
import { 가짜모드, 네이버키들 } from "../../naver/키.js";
import { getSetting, setSetting } from "../../db/repositories/settings.js";
import { getCategory, listAllCategories, 키워드칸적기 } from "../../db/repositories/categories.js";
import { 보관함개수, 보관함목록, 다음키워드, 키워드상태 } from "../../db/repositories/keywordPool.js";
import { 키워드모으기, 모으기진행보기, 모으기멈추기, 씨앗뽑기, 모으기한도ms } from "../../naver/키워드모으기.js";

/** 시험으로 한 번 물어볼 말. 누구 블로그든 결과가 나오는 흔한 말로 둔다. */
const 시험말 = "블로그";
/** 한 번 모은 키워드를 쓰는 기간. 지나면 탭에 «다시 모으기 권장» 이 뜬다. */
export const 키워드유효일 = 30;

function 막기(reply: FastifyReply): boolean {
  if (주인자리인가()) return false;
  reply.code(403);
  return true;
}

function 마지막시험(): unknown {
  try { return JSON.parse(getSetting("naver_last_test") ?? "null"); } catch { return null; }
}

export async function keywordsRoutes(app: FastifyInstance) {
  app.post("/api/settings/test-naver", async (_req, reply) => {
    if (막기(reply)) return { ok: false, error: 체험은못함 };

    // 둘은 서로 상관없다. 같이 부르고, 하나가 안 돼도 다른 하나는 알려 준다.
    const [블로그, 광고] = await Promise.all([블로그검색(시험말, 1), 연관키워드([시험말])]);
    const 답 = {
      ok: 블로그.ok && 광고.ok,
      fake: 가짜모드(),
      at: new Date().toISOString(),
      search: 블로그.ok
        ? { ok: true, detail: `«${시험말}» 이미 쓰인 글 ${블로그.total.toLocaleString()}건` }
        : { ok: false, why: 블로그.why },
      ad: 광고.ok
        ? { ok: true, detail: `연관 키워드 ${광고.rows.length.toLocaleString()}개, 월간 검색량 받음` }
        : { ok: false, why: 광고.why },
    };
    setSetting("naver_last_test", JSON.stringify(답));
    return 답;
  });

  // 탭 첫 화면 — 연결 요약 + 카테고리마다 모은 상태.
  app.get("/api/keywords", async (_req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const 키 = 네이버키들();
    return {
      fake: 가짜모드(),
      validDays: 키워드유효일,
      limitMs: 모으기한도ms,
      connection: {
        searchSet: !!(키.searchId && 키.searchSecret),
        adSet: !!(키.adKey && 키.adSecret && 키.adCustomer),
        lastTest: 마지막시험(),
      },
      categories: listAllCategories().map((c) => {
        const 다음 = 다음키워드(c.id);
        return {
          id: c.id, name: c.name, active: c.active,
          apply: c.kw_apply === 1,
          refreshedAt: c.kw_refreshed_at ?? null,
          error: c.kw_error ?? null,
          paused: !!c.kw_job,
          seeds: 씨앗뽑기(c),
          topicKeyword: c.topic_keyword ?? null,
          counts: 보관함개수(c.id),
          next: 다음 ? 다음.keyword : null,
          progress: 모으기진행보기(c.id),
        };
      }),
    };
  });

  // 한 카테고리의 보관함.
  app.get("/api/keywords/:id", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    return {
      counts: 보관함개수(id),
      progress: 모으기진행보기(id),
      items: 보관함목록(id).map((r) => {
        let top: { title: string }[] = [];
        try { top = JSON.parse(r.top_json ?? "[]"); } catch { top = []; }
        return {
          id: r.id, keyword: r.keyword, pc: r.pc, mobile: r.mobile, comp: r.comp,
          docTotal: r.doc_total, ratio: r.ratio, grade: r.grade, seed: r.seed,
          status: r.status, fetchedAt: r.fetched_at, usedAt: r.used_at,
          top: top.slice(0, 3).map((t) => t.title),
        };
      }),
    };
  });

  // [지금 모으기] / [이어서 모으기]. 끝날 때까지(최대 5분) 기다렸다가 답한다.
  // Cloud Run 은 요청이 열려 있을 때만 CPU 를 준다 — 뒤에서 돌리면 멈춘다.
  app.post("/api/keywords/:id/collect", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const 키 = 네이버키들();
    if (!가짜모드() && !(키.searchId && 키.searchSecret && 키.adKey && 키.adSecret && 키.adCustomer)) {
      reply.code(409);
      return { error: "네이버 키가 아직 다 들어 있지 않습니다. 위 ① 네이버 연결에서 키 5개를 넣어 주세요." };
    }
    const { resume } = (req.body ?? {}) as { resume?: boolean };
    return 키워드모으기(id, { 이어서: !!resume });
  });

  app.get("/api/keywords/:id/progress", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    return { progress: 모으기진행보기(Number((req.params as { id: string }).id)) };
  });

  app.post("/api/keywords/:id/stop", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    return { ok: 모으기멈추기(Number((req.params as { id: string }).id)) };
  });

  // [포스팅에 적용] 켜고 끄기. 쓸 키워드가 하나도 없으면 켜지 않는다.
  app.put("/api/keywords/:id/apply", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const { on } = (req.body ?? {}) as { on?: boolean };
    if (on && !다음키워드(id)) {
      reply.code(400);
      return { error: "쓸 키워드(골드·실버·브론즈)가 아직 없습니다. 먼저 ② 키워드 모으기를 해 주세요." };
    }
    키워드칸적기(id, { kw_apply: on ? 1 : 0 });
    return { ok: true, apply: !!on };
  });

  // [보류] / [후보로]. 이미 쓴 것은 바꾸지 않는다.
  app.put("/api/keywords/item/:itemId", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const itemId = Number((req.params as { itemId: string }).itemId);
    const { status } = (req.body ?? {}) as { status?: string };
    if (status !== "hold" && status !== "candidate") { reply.code(400); return { error: "상태는 hold 또는 candidate 만 됩니다." }; }
    if (!키워드상태(itemId, status)) { reply.code(404); return { error: "키워드를 찾을 수 없거나 이미 쓴 키워드입니다." }; }
    return { ok: true };
  });
}
