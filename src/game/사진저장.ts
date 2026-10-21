/**
 * 🕹️ 게임 사진 저장 — **별도 저장통** (GAME_PLAN 7-2).
 *
 *   GAME_SHOT_BUCKET=<저장통 이름>     Google Cloud Storage. 화면에는 15분짜리 서명 주소로만 보인다
 *   GAME_SHOT_BUCKET=local:<폴더>      GCS 없이 시험할 때 — 이 폴더에 파일로 둔다(회사 PC·집 PC 시험용)
 *   (비어 있음)                         게임 기능 전체를 막고 설정 안내를 띄운다(needsGameBucket)
 *
 * 기존 `gcsState`(DATA_DIR 동기화)는 건드리지 않는다. 사진이 커서 같은 통에 넣으면
 * 서버가 켜질 때마다 전부 내려받게 된다.
 */
import { Storage } from "@google-cloud/storage";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export type 저장통 = { kind: "local"; dir: string } | { kind: "gcs"; bucket: string } | null;

export function 지금저장통(): 저장통 {
  const 값 = (process.env.GAME_SHOT_BUCKET ?? "").trim();
  if (!값) return null;
  if (값.startsWith("local:")) {
    const 폴더 = 값.slice("local:".length).trim() || path.join(config.paths.dataDir, "game-shots");
    return { kind: "local", dir: path.resolve(config.paths.projectRoot, 폴더) };
  }
  return { kind: "gcs", bucket: 값.replace(/^gs:\/\//, "") };
}

export const 저장통안내 =
  "게임 사진 저장통(GAME_SHOT_BUCKET)이 설정되지 않았습니다. "
  + "서버에서는 Cloud Shell 에서 저장통을 만들고 배포 때 GAME_SHOT_BUCKET 을 넣어 주세요(GAME_PLAN 12번). "
  + "PC 에서 시험할 때는 .env 에 GAME_SHOT_BUCKET=local:data/game-shots 를 넣으면 됩니다.";

let storage: Storage | undefined;
function 통(이름: string) {
  storage ??= new Storage();
  return storage.bucket(이름);
}

/** `game/<게임id>/<YYYY-MM>/<shot_id>.webp` */
export function 사진경로(gameId: string, shotId: number, 때 = new Date()): string {
  const 달 = `${때.getFullYear()}-${String(때.getMonth() + 1).padStart(2, "0")}`;
  return `game/${gameId.replace(/[^a-z0-9_-]/gi, "")}/${달}/${shotId}.webp`;
}

function 로컬자리(dir: string, 경로: string): string {
  const 자리 = path.resolve(dir, 경로);
  // 경로에 ../ 가 섞여 저장통 밖으로 나가지 못하게.
  if (!자리.startsWith(path.resolve(dir) + path.sep)) throw new Error("사진 경로가 저장통 밖입니다.");
  return 자리;
}

export async function 사진넣기(경로: string, 내용: Buffer): Promise<void> {
  const 것 = 지금저장통();
  if (!것) throw new Error(저장통안내);
  if (것.kind === "local") {
    const 자리 = 로컬자리(것.dir, 경로);
    fs.mkdirSync(path.dirname(자리), { recursive: true });
    fs.writeFileSync(자리, 내용);
    return;
  }
  await 통(것.bucket).file(경로).save(내용, { contentType: "image/webp", resumable: false });
}

export async function 사진읽기(경로: string): Promise<Buffer | null> {
  const 것 = 지금저장통();
  if (!것) return null;
  try {
    if (것.kind === "local") return fs.readFileSync(로컬자리(것.dir, 경로));
    const [내용] = await 통(것.bucket).file(경로).download();
    return 내용;
  } catch {
    return null;
  }
}

export async function 사진지우기(경로: string): Promise<void> {
  const 것 = 지금저장통();
  if (!것) return;
  try {
    if (것.kind === "local") fs.rmSync(로컬자리(것.dir, 경로), { force: true });
    else await 통(것.bucket).file(경로).delete({ ignoreNotFound: true });
  } catch { /* 이미 없으면 그만 */ }
}

let 서명안됨 = false;

/**
 * 화면이 사진을 볼 주소. GCS 면 **15분 서명 주소**(저장통은 공개하지 않는다),
 * 로컬이면 null — 그때는 라우트가 파일을 그대로 흘려 준다.
 */
export async function 서명주소(경로: string): Promise<string | null> {
  const 것 = 지금저장통();
  if (!것 || 것.kind === "local" || 서명안됨) return null;
  try {
    const [주소] = await 통(것.bucket).file(경로).getSignedUrl({
      version: "v4", action: "read", expires: Date.now() + 15 * 60_000,
    });
    return 주소;
  } catch (탈) {
    // Cloud Run 서비스 계정에 «토큰 만들기» 권한이 없으면 서명이 안 된다. 그때는 서버가 사진을
    // 직접 흘려 준다(라우트가 null 을 보고 사진읽기로 넘어간다). 한 번만 적고 다시 시도하지 않는다.
    서명안됨 = true;
    console.warn(`[게임 사진] 서명 주소를 못 만들어 서버가 직접 보냅니다: ${(탈 as Error).message}`);
    return null;
  }
}
