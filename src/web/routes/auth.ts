/**
 * 들어오는 문.
 *
 * 예전에는 이 프로그램이 **자기 접속 코드**를 따로 만들어 썼다. 모양은
 * 같았지만(1차 초대 → 2차 기기별 3개) 장부가 달라서, 통합 관리자 대시보드
 * 에서 판 키가 여기서는 안 통했다. 이제 장부는 하나다.
 *
 *   마스터 토큰   주인만. 환경변수 DASHBOARD_TOKEN
 *   1차 + 2차키   대시보드가 발급해 메일로 보낸 것
 */

import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { validateKeyPair, checkSession, keyserverEnabled } from "../../keyserver.js";
import {
  openSession,
  findSession,
  closeSession,
  touchSession,
} from "../../db/repositories/keyserverSessions.js";

// 짧은 코드를 무차별 대입으로 시도해보는 걸 늦추기 위한 간단한 IP별 레이트 리밋.
// 프로세스 하나짜리 소규모 개인용 도구라 인메모리로 충분하다.
// (키 서버도 자기 쪽에서 따로 센다. 여기는 그 앞에서 한 겹 더 막는 것이다.)
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

function givenToken(req: { headers: Record<string, unknown>; query: unknown }): string {
  const header = req.headers["x-dashboard-token"];
  const query = (req.query as { token?: string } | undefined)?.token;
  const provided = (Array.isArray(header) ? header[0] : header) ?? query;
  return typeof provided === "string" ? provided : "";
}

export async function authRoutes(app: FastifyInstance) {
  // 로그인 전이라 아직 토큰이 없는 게 당연하므로 토큰 검사 훅의 예외 대상이다(server.ts 참고).
  app.post("/api/auth/redeem", async (req, reply) => {
    if (isRateLimited(req.ip)) {
      reply.code(429);
      return { error: "너무 많이 시도했습니다. 잠시 후 다시 시도해주세요." };
    }

    const body = req.body as { value?: string; value2?: string };
    const key1 = (body.value || "").trim().toUpperCase();
    const key2 = (body.value2 || "").trim().toUpperCase();
    if (!key1) {
      reply.code(400);
      return { error: "값을 입력해주세요." };
    }

    // 주인은 토큰 하나로 들어온다. 2차키를 물을 대상이 아니다.
    if (config.dashboardToken && key1 === config.dashboardToken.toUpperCase()) {
      return { token: config.dashboardToken, master: true };
    }
    // 대소문자를 바꿔 버리면 토큰이 안 맞을 수 있어, 원문으로도 한 번 본다.
    if (config.dashboardToken && (body.value || "").trim() === config.dashboardToken) {
      return { token: config.dashboardToken, master: true };
    }

    if (!keyserverEnabled()) {
      reply.code(503);
      return { error: "접속키 서버가 아직 연결되지 않았습니다. 관리자에게 문의해주세요." };
    }
    if (!key2) {
      reply.code(400);
      return { error: "2차 인증키도 함께 입력해주세요.", needSecondary: true };
    }

    const answer = await validateKeyPair(key1, key2);
    if (!answer.ok) {
      // 서버가 준 말을 그대로 전한다. "틀렸습니다" 보다 "사용이 중지된
      // 키입니다" 가 다음에 무엇을 할지 알려 준다.
      reply.code(answer.reason === "unreachable" ? 503 : 401);
      return { error: answer.message || "유효하지 않거나 만료된 접속키입니다.",
               reason: answer.reason };
    }
    if (!answer.sessionToken) {
      reply.code(401);
      return { error: "2차 인증키도 함께 입력해주세요.", needSecondary: true };
    }

    // 키는 맞았다. 여기서부터는 **이 서버 안의 일**이다.
    //
    // 감싸는 이유: 한 번 데였다. 여기서 터지면 관문에 «Internal Server Error»
    // 만 뜨고, 쓰는 분도 고치는 사람도 무엇이 잘못인지 알 길이 없었다.
    // 키가 틀린 것인지, 서버가 못 닿은 것인지, 이쪽 탈인지 갈라 줘야 한다.
    try {
      const token = openSession({
        // 자리의 주인은 1차키다. 2차키는 기기마다 달라서 한 사람의 글이
        // 세 자리로 흩어진다 — tenancy.ts 참고.
        key1,
        key2,
        remoteToken: answer.sessionToken,
        holderName: answer.name,
        role: answer.role,
        deviceLabel: answer.deviceLabel,
      });
      return { token, master: false, name: answer.name || "", role: answer.role || "client" };
    } catch (err) {
      req.log.error({ err }, "[auth] 세션을 여는 데 실패했습니다");
      reply.code(500);
      return {
        error: "접속키는 맞았는데 이 서버가 기록을 못 했습니다. "
             + "관리자에게 알려 주세요.",
        reason: "session_store_failed",
        detail: String((err as Error)?.message || err),
      };
    }
  });

  /**
   * 이 기기가 아직 주인인지 확인한다. 화면이 1분마다 부른다.
   *
   * 같은 2차키로 다른 기기에서 들어오면 키 서버의 세션값이 바뀌고, 여기서
   * 그것을 알아채 이 브라우저를 끊는다. 키를 정지시켰을 때도 같다 —
   * 들어와 있던 사람이 계속 쓰면 정지시킨 뜻이 없다.
   */
  app.get("/api/auth/heartbeat", async (req, reply) => {
    if (isMaster(req)) return { ok: true, master: true };

    const session = findSession(givenToken(req));
    if (!session) {
      reply.code(401);
      return { ok: false, reason: "no_session" };
    }
    const answer = await checkSession(session.key2, session.remote_token);
    if (answer.ok) {
      touchSession(session.token);
      return { ok: true };
    }
    // 닿지 못한 것은 끊을 이유가 아니다. 인터넷이 잠깐 끊겼다고 쓰던 사람을
    // 내보내면, 고칠 수 없는 이유로 일이 끊긴다. 다음 차례에 다시 묻는다.
    if (answer.reason === "unreachable" || answer.reason === "bad_answer") {
      return { ok: true, unchecked: true };
    }
    closeSession(session.token);
    reply.code(401);
    return { ok: false, reason: answer.reason || "revoked",
             error: answer.message || "접속이 종료되었습니다." };
  });

  app.get("/api/auth/whoami", async (req) => {
    if (isMaster(req)) return { isMaster: true, name: "", role: "owner" };
    const session = findSession(givenToken(req));
    return { isMaster: false, name: session?.holder_name || "",
             role: session?.role || "client" };
  });
}
