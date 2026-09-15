import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import {
  redeemAccessCode,
  listAccessCodes,
  resetAccessCodes,
} from "../../db/repositories/accessCodes.js";

// 짧은 코드를 무차별 대입으로 시도해보는 걸 늦추기 위한 간단한 IP별 레이트 리밋.
// 프로세스 하나짜리 소규모 개인용 도구라 인메모리로 충분하다.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const attemptsByIp = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attemptsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    attemptsByIp.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function isMaster(req: { headers: Record<string, unknown>; query: unknown }): boolean {
  if (!config.dashboardToken) return false;
  const header = req.headers["x-dashboard-token"];
  const query = (req.query as { token?: string } | undefined)?.token;
  const provided = (Array.isArray(header) ? header[0] : header) ?? query;
  return provided === config.dashboardToken;
}

export async function authRoutes(app: FastifyInstance) {
  // 로그인 전이라 아직 토큰이 없는 게 당연하므로 토큰 검사 훅의 예외 대상이다(server.ts 참고).
  app.post("/api/auth/redeem", async (req, reply) => {
    if (isRateLimited(req.ip)) {
      reply.code(429);
      return { error: "너무 많이 시도했습니다. 잠시 후 다시 시도해주세요." };
    }

    const { value } = req.body as { value?: string };
    const input = (value || "").trim();
    if (!input) {
      reply.code(400);
      return { error: "값을 입력해주세요." };
    }

    if (config.dashboardToken && input === config.dashboardToken) {
      return { token: config.dashboardToken, master: true };
    }

    const sessionToken = redeemAccessCode(input);
    if (!sessionToken) {
      reply.code(401);
      return { error: "이미 사용됐거나 존재하지 않는 접속 코드입니다." };
    }
    return { token: sessionToken, master: false };
  });

  app.get("/api/auth/whoami", async (req) => {
    return { isMaster: isMaster(req) };
  });

  app.get("/api/auth/codes", async (req, reply) => {
    if (!isMaster(req)) {
      reply.code(403);
      return { error: "마스터만 접속 코드를 조회할 수 있습니다." };
    }
    return listAccessCodes().map((c) => ({
      code: c.code,
      redeemed: !!c.redeemed_at,
      redeemed_at: c.redeemed_at,
    }));
  });

  app.post("/api/auth/codes/reset", async (req, reply) => {
    if (!isMaster(req)) {
      reply.code(403);
      return { error: "마스터만 접속 코드를 재발급할 수 있습니다." };
    }
    const codes = resetAccessCodes();
    return codes.map((c) => ({ code: c.code, redeemed: !!c.redeemed_at, redeemed_at: c.redeemed_at }));
  });
}
