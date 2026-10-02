/**
 * 네이버 키워드 — 1단계는 **연결 테스트** 하나뿐이다.
 * (보관함·추천·갱신 API 는 2단계에서 이 파일에 붙는다.)
 *
 * 주인 자리만 쓴다. 체험 키는 403 — 사장님 네이버 키 한도를 쓰는 자리다.
 */
import type { FastifyInstance } from "fastify";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { 블로그검색 } from "../../naver/블로그검색.js";
import { 연관키워드 } from "../../naver/검색광고.js";
import { 가짜모드 } from "../../naver/키.js";

/** 시험으로 한 번 물어볼 말. 누구 블로그든 결과가 나오는 흔한 말로 둔다. */
const 시험말 = "블로그";

export async function keywordsRoutes(app: FastifyInstance) {
  app.post("/api/settings/test-naver", async (_req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { ok: false, error: 체험은못함 }; }

    // 둘은 서로 상관없다. 같이 부르고, 하나가 안 돼도 다른 하나는 알려 준다.
    const [블로그, 광고] = await Promise.all([블로그검색(시험말, 1), 연관키워드([시험말])]);
    return {
      ok: 블로그.ok && 광고.ok,
      fake: 가짜모드(),
      search: 블로그.ok
        ? { ok: true, detail: `«${시험말}» 이미 쓰인 글 ${블로그.total.toLocaleString()}건` }
        : { ok: false, why: 블로그.why },
      ad: 광고.ok
        ? { ok: true, detail: `연관 키워드 ${광고.rows.length.toLocaleString()}개, 월간 검색량 받음` }
        : { ok: false, why: 광고.why },
    };
  });
}
