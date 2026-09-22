import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

loadEnv();

const projectRoot = path.resolve(import.meta.dirname, "..");
// Cloud Run처럼 컨테이너 자체 디스크가 요청 사이/재시작 사이에 유지되지 않는
// 환경에서는 DATA_DIR을 로컬 임시 경로(예: /tmp/maim-state)로 지정하고,
// GCS_STATE_BUCKET을 함께 설정하면 이 디렉터리 전체가 시작 시 버킷에서
// 복원되고 주기적으로/종료 시 버킷에 다시 저장된다(src/persistence/gcsState.ts).
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
  pixabayApiKey: process.env.PIXABAY_API_KEY ?? "",
  claudeBin: process.env.CLAUDE_BIN ?? "claude",
  // 설정하면 모든 API 요청에 x-dashboard-token 헤더(또는 ?token= 쿼리)가 일치해야 한다.
  // SSH 터널을 못 쓰고 VPS 대시보드를 부득이 직접 노출해야 할 때의 최소 방어선이다.
  dashboardToken: process.env.DASHBOARD_TOKEN || "",
  // 설정하면 DATA_DIR 전체를 이 GCS 버킷과 주기적으로 동기화한다(Cloud Run 전용, 위 설명 참고).
  gcsStateBucket: process.env.GCS_STATE_BUCKET || "",
  // 통합 관리자 대시보드가 접속키를 적어 두는 앱스 스크립트 주소(.../exec).
  // 이 프로그램은 자기 접속 코드를 따로 만들지 않고 그 장부에 묻는다 —
  // 파는 곳과 여는 곳이 갈라져 있으면 누구에게 무엇을 팔았는지 한 군데서
  // 볼 수가 없다. 비워 두면 마스터 토큰으로만 들어올 수 있다.
  keyserverUrl: process.env.KEYSERVER_URL || "",
  // 키는 프로그램마다 따로다. 안 보내면 서버가 다른 프로그램의 장부를 뒤진다.
  keyserverProgram: process.env.KEYSERVER_PROGRAM || "naver-blog",
  paths: {
    projectRoot,
    dataDir,
    dbFile: path.join(dataDir, "app.db"),
    generatedDir: path.join(dataDir, "generated"),
  },
} as const;
