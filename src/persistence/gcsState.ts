import { Storage } from "@google-cloud/storage";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let storage: Storage | undefined;

function getBucket() {
  if (!config.gcsStateBucket) return undefined;
  storage ??= new Storage();
  return storage.bucket(config.gcsStateBucket);
}

// 생성된 포스팅 이미지가 저장되는 접두사. 이 아래 파일들은 시작 시 한꺼번에
// 내려받지 않고, 실제로 요청됐을 때 downloadFileIfMissing()으로 낱개만 받는다.
const GENERATED_PREFIX = "generated/";

/**
 * Cloud Run처럼 컨테이너 로컬 디스크가 요청 사이/재시작 사이에 보존되지 않는
 * 환경을 위한 것. GCS를 실시간 FUSE 마운트로 쓰면 SQLite가 필요로 하는 파일
 * 잠금 등 POSIX 동작이 온전히 지원되지 않아 DB 접근이 깨지므로, 대신 시작 시
 * 버킷에서 DB/로그인 정보 등 꼭 필요한 파일만 로컬 디스크(config.paths.dataDir)로
 * 내려받아 완전한 로컬 파일시스템에서 동작하게 한다. 생성된 이미지(generated/)는
 * 포스팅이 쌓일수록 계속 늘어나서, 전부 내려받으면 Cloud Run의 컨테이너 시작
 * 제한 시간(기본 240초)을 넘겨 배포/재시작 자체가 실패할 수 있어 제외하고,
 * 대신 실제로 화면에 표시될 때 downloadFileIfMissing()으로 그 파일 하나만
 * 받는다. GCS_STATE_BUCKET이 없으면 아무 것도 하지 않는다(로컬/VPS 배포에는
 * 영향 없음).
 */
export async function downloadState(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const root = config.paths.dataDir;
  fs.mkdirSync(root, { recursive: true });
  const [files] = await bucket.getFiles();
  const essential = files.filter((file) => !file.name.startsWith(GENERATED_PREFIX));
  await Promise.all(
    essential.map(async (file) => {
      const localPath = path.join(root, file.name);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      await file.download({ destination: localPath });
    }),
  );
  console.log(
    `[gcsState] gs://${config.gcsStateBucket}에서 ${essential.length}개 파일을 복원했습니다 ` +
      `(생성 이미지 ${files.length - essential.length}개는 필요할 때 낱개로 내려받습니다).`,
  );
}

/**
 * 로컬에 없는 파일 1개(주로 생성된 이미지)를 버킷에서 그때그때 내려받는다.
 * relPath는 config.paths.dataDir 기준 상대 경로. 버킷 미설정/다운로드 실패
 * 시 false를 반환하고, 호출부(이미지 서빙 라우트)가 404로 처리한다.
 */
export async function downloadFileIfMissing(relPath: string): Promise<boolean> {
  const bucket = getBucket();
  if (!bucket) return false;
  const localPath = path.join(config.paths.dataDir, relPath);
  if (fs.existsSync(localPath)) return true;
  try {
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await bucket.file(relPath).download({ destination: localPath });
    return true;
  } catch {
    return false;
  }
}

function listLocalFiles(dir: string, root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listLocalFiles(full, root, out);
    else out.push(path.relative(root, full));
  }
  return out;
}

/** 로컬 디스크 상태(DB/생성된 이미지/claude 로그인 정보 등)를 통째로 버킷에 다시 올린다. */
export async function uploadState(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const root = config.paths.dataDir;
  if (!fs.existsSync(root)) return;
  const relPaths = listLocalFiles(root, root);
  await Promise.all(
    relPaths.map((rel) => bucket.upload(path.join(root, rel), { destination: rel })),
  );
}
