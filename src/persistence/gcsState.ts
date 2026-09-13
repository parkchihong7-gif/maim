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

/**
 * Cloud Run처럼 컨테이너 로컬 디스크가 요청 사이/재시작 사이에 보존되지 않는
 * 환경을 위한 것. GCS를 실시간 FUSE 마운트로 쓰면 SQLite가 필요로 하는 파일
 * 잠금 등 POSIX 동작이 온전히 지원되지 않아 DB 접근이 깨지므로, 대신 시작 시
 * 버킷 전체를 로컬 디스크(config.paths.dataDir)로 내려받아 완전한 로컬
 * 파일시스템에서 동작하게 한다. GCS_STATE_BUCKET이 없으면 아무 것도 하지
 * 않는다(로컬/VPS 배포에는 영향 없음).
 */
export async function downloadState(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const root = config.paths.dataDir;
  fs.mkdirSync(root, { recursive: true });
  const [files] = await bucket.getFiles();
  await Promise.all(
    files.map(async (file) => {
      const localPath = path.join(root, file.name);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      await file.download({ destination: localPath });
    }),
  );
  console.log(`[gcsState] gs://${config.gcsStateBucket}에서 ${files.length}개 파일을 복원했습니다.`);
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
