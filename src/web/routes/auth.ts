import type { FastifyInstance } from "fastify";
import { runManualLogin } from "../../naver/login.js";
import { hasSavedSession } from "../../naver/browserContext.js";
import { getSetting } from "../../db/repositories/settings.js";
import { config } from "../../config.js";

let loginInProgress = false;

export async function authRoutes(app: FastifyInstance) {
  app.get("/api/auth/status", async () => ({
    deploymentMode: config.deploymentMode,
    hasSavedSession: hasSavedSession(),
    naverLoginStatus: getSetting("naverLoginStatus") || "disconnected",
    naverLoginAt: getSetting("naverLoginAt") || null,
    loginInProgress,
  }));

  app.post("/api/auth/login", async (req, reply) => {
    if (config.deploymentMode === "vps") {
      reply.code(400);
      return { error: "VPS 모드에서는 헤드풀 로그인을 실행할 수 없습니다. 세션 파일을 업로드하세요." };
    }
    if (loginInProgress) {
      return { started: false, message: "이미 로그인 시도가 진행 중입니다." };
    }
    loginInProgress = true;
    runManualLogin()
      .catch((err) => app.log.error(err, "네이버 로그인 실패"))
      .finally(() => {
        loginInProgress = false;
      });
    return { started: true, message: "브라우저 창이 열렸습니다. 직접 로그인해주세요 (최대 10분 대기)." };
  });
}
