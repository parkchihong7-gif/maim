import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import { runManualLogin } from "../../naver/login.js";
import { hasSavedSession } from "../../naver/browserContext.js";
import { getSetting, setSetting } from "../../db/repositories/settings.js";
import { encryptBuffer, decryptBuffer } from "../../utils/crypto.js";
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

  // 로컬 -> VPS 세션 이전용. 로컬에서 내보내 암호화 파일을 받고, VPS에서 업로드해 복원한다.
  app.get("/api/auth/export-session", async (req, reply) => {
    const passphrase = (req.query as { passphrase?: string }).passphrase;
    if (!passphrase) {
      reply.code(400);
      return { error: "passphrase 쿼리 파라미터가 필요합니다." };
    }
    if (!hasSavedSession()) {
      reply.code(404);
      return { error: "저장된 세션이 없습니다. 먼저 로그인하세요." };
    }
    const plain = fs.readFileSync(config.paths.naverSessionFile);
    const encrypted = encryptBuffer(plain, passphrase);
    reply.header("Content-Disposition", 'attachment; filename="naver-session.enc"');
    reply.type("application/octet-stream");
    return encrypted;
  });

  app.post("/api/auth/import-session", async (req, reply) => {
    const { fileBase64, passphrase } = req.body as { fileBase64?: string; passphrase?: string };
    if (!fileBase64 || !passphrase) {
      reply.code(400);
      return { error: "fileBase64와 passphrase가 모두 필요합니다." };
    }
    let decrypted: Buffer;
    try {
      decrypted = decryptBuffer(Buffer.from(fileBase64, "base64"), passphrase);
    } catch {
      reply.code(400);
      return { error: "복호화 실패 — 암호가 틀렸거나 파일이 손상되었습니다." };
    }
    fs.writeFileSync(config.paths.naverSessionFile, decrypted);
    setSetting("naverLoginStatus", "connected");
    return { ok: true };
  });
}
