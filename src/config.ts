import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv();

const projectRoot = path.resolve(import.meta.dirname, "..");
// Cloud Run처럼 컨테이너 자체 디스크가 요청 사이에 유지되지 않는 환경에서는
// DATA_DIR을 마운트된 영구 볼륨 경로(예: /mnt/data)로 지정해 DB/이미지가 보존되게 한다.
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(projectRoot, "data");

fs.mkdirSync(dataDir, { recursive: true });

function requireEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: requireEnvInt("PORT", 4173),
  timezone: process.env.TIMEZONE ?? "Asia/Seoul",
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY ?? "",
  pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  // 설정하면 모든 API 요청에 x-dashboard-token 헤더(또는 ?token= 쿼리)가 일치해야 한다.
  // SSH 터널을 못 쓰고 VPS 대시보드를 부득이 직접 노출해야 할 때의 최소 방어선이다.
  dashboardToken: process.env.DASHBOARD_TOKEN || "",
  paths: {
    projectRoot,
    dataDir,
    dbFile: path.join(dataDir, "app.db"),
    generatedDir: path.join(dataDir, "generated"),
  },
} as const;
