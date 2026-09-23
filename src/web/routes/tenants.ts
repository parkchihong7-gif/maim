/**
 * 체험 회원 자리 관리 — **주인 전용.**
 *
 * 화면(관리자 설정)에서 지금 누가 체험으로 들어와 있는지 보고, 필요하면
 * 그 자리를 통째로 지운다.
 *
 * 왜 주인만인가
 *   지우는 길이다. 체험 회원이 부를 수 있으면 서로의 자리를 지운다.
 *   마스터 토큰(DASHBOARD_TOKEN)으로 들어온 요청만 통과시킨다.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../../config.js";
import { listTenants, purgeTenant } from "../../db/repositories/tenants.js";

function 주인인가(req: FastifyRequest): boolean {
  if (!config.dashboardToken) return true;  // 토큰을 안 걸어 둔 개인용. 주인뿐이다
  const header = req.headers["x-dashboard-token"];
  const query = (req.query as { token?: string } | undefined)?.token;
  const provided = (Array.isArray(header) ? header[0] : header) ?? query;
  return provided === config.dashboardToken;
}

export async function tenantsRoutes(app: FastifyInstance) {
  app.get("/api/tenants", async (req, reply) => {
    if (!주인인가(req)) { reply.code(403); return { error: "주인만 볼 수 있습니다." }; }
    return listTenants();
  });

  app.post("/api/tenants/purge", async (req, reply) => {
    if (!주인인가(req)) { reply.code(403); return { error: "주인만 지울 수 있습니다." }; }
    const { ownerKey } = (req.body ?? {}) as { ownerKey?: string };
    if (!ownerKey || !ownerKey.trim()) {
      reply.code(400);
      return { error: "지울 1차키를 넣어 주세요." };
    }
    try {
      const 결과 = purgeTenant(ownerKey.trim());
      console.log(`[tenants] ${ownerKey.trim()} 의 자리를 지웠습니다 —`, 결과);
      return { ok: true, ...결과 };
    } catch (탈) {
      reply.code(400);
      return { error: (탈 as Error).message };
    }
  });
}
