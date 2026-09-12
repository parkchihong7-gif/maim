import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv();

const projectRoot = path.resolve(import.meta.dirname, "..");
const dataDir = path.join(projectRoot, "data");

fs.mkdirSync(dataDir, { recursive: true });

function requireEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  deploymentMode: (process.env.DEPLOYMENT_MODE ?? "local") as "local" | "vps",
  host: process.env.HOST ?? "127.0.0.1",
  port: requireEnvInt("PORT", 4173),
  timezone: process.env.TIMEZONE ?? "Asia/Seoul",
  postsPerDay: Math.min(requireEnvInt("POSTS_PER_DAY", 5), 5),
  dailyHardCap: 5,
  publishWindowStart: process.env.PUBLISH_WINDOW_START ?? "09:00",
  publishWindowEnd: process.env.PUBLISH_WINDOW_END ?? "22:00",
  unsplashAccessKey: process.env.UNSPLASH_ACCESS_KEY ?? "",
  pexelsApiKey: process.env.PEXELS_API_KEY ?? "",
  sessionExportPassphrase: process.env.SESSION_EXPORT_PASSPHRASE ?? "",
  playwrightHeadless: (process.env.PLAYWRIGHT_HEADLESS ?? "true") !== "false",
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  paths: {
    projectRoot,
    dataDir,
    dbFile: path.join(dataDir, "app.db"),
    naverSessionFile: path.join(dataDir, "naver-session.json"),
    generatedDir: path.join(dataDir, "generated"),
  },
} as const;
