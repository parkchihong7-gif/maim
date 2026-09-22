import { Storage } from "@google-cloud/storage";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

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
 * **내려받지도 올리지도 않을 것들.** 한 번 데였다.
 *
 * `/tmp` 는 컨테이너 메모리를 깎아 쓰는 램디스크다. 시작할 때 여기에 102MB 를
 * 풀어 놓고, 그 위에서 파일 330개를 한꺼번에 주고받으니 512Mi 가 바닥났다.
 * 메모리가 모자라면 쓰던 것이 잘리고, 그게 SQLite 에는 **깨진 파일**로 보인다.
 * 마이그레이션이 "적용됐다"고 기록만 남고 표는 안 생긴 일이 실제로 있었다.
 *
 * `cash-flow/` 는 **남의 것**이다. 통합 관리자 대시보드가 같은 버킷의 제
 * 칸을 쓴다. 가져올 이유가 없고, 더 나쁜 것은 60초마다 **도로 올린다는**
 * 것이다 — 대시보드가 글을 쓰는 중에 덮으면 그쪽 DB 도 같은 식으로 깨진다.
 */
const SKIP_PREFIXES = [
  "cash-flow/",             // 통합 관리자 대시보드 몫
  "home/.claude/backups/",  // Claude CLI 가 쌓는 백업. 로그인에는 필요 없다
];

function 건너뛸것(name: string): boolean {
  return SKIP_PREFIXES.some((접두) => name.startsWith(접두));
}

/**
 * 한 번에 몇 개씩만 한다.
 *
 * `Promise.all` 에 330개를 한꺼번에 넣으면 그만큼의 버퍼가 동시에 잡힌다.
 * 작은 컨테이너에서는 그것만으로 메모리가 넘친다. 조금 느려도 안 죽는 편이 낫다.
 */
async function 나눠서<T>(목록: T[], 한번에: number,
                          일: (하나: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < 목록.length; i += 한번에) {
    await Promise.all(목록.slice(i, i + 한번에).map(일));
  }
}

/** 한 번에 주고받을 개수. 메모리와 속도의 타협점. */
const AT_ONCE = 8;

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
  const essential = files.filter(
    (file) => !file.name.startsWith(GENERATED_PREFIX) && !건너뛸것(file.name),
  );
  await 나눠서(essential, AT_ONCE, async (file) => {
    const localPath = path.join(root, file.name);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await file.download({ destination: localPath });
  });
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

/** SQLite 가 쓰는 동안 생기는 곁파일들. 통째로 올리면 안 되는 것들이다. */
const DB_SIDE_FILES = ["-journal", "-wal", "-shm"];

/**
 * DB 를 **성한 한 벌**로 떠 둔다. 실패하면 null.
 *
 * 왜 파일을 그냥 복사하면 안 되나 — **한 번 데였다.**
 *   예전에는 `app.db` 를 다른 파일과 똑같이 바이트째 올렸다. SQLite 가 글을
 *   쓰는 중에 올리면 **반쯤 쓰인 판**이 버킷에 남는다. 다음에 그걸 내려받은
 *   컨테이너는 읽기는 되는데 쓰려고만 하면
 *     database disk image is malformed
 *   로 죽는다. 실제로 그렇게 됐다.
 *
 *   `backup()` 은 SQLite 가 제 잠금을 쥔 채 떠 주는 것이라 언제 떠도 앞뒤가
 *   맞는다. 곁파일(-journal 등)을 따로 챙길 일도 없어진다.
 */
async function 성한DB한벌(): Promise<string | null> {
  const 원본 = config.paths.dbFile;
  if (!fs.existsSync(원본)) return null;
  const 뜬것 = `${원본}.snapshot`;
  try {
    await getDb().backup(뜬것);
    return 뜬것;
  } catch (err) {
    // **깨진 것을 올리지 않는다.** 버킷에 아직 성한 판이 있을 수 있는데,
    // 그 위에 덮으면 되살릴 길이 사라진다. 나머지 파일은 그대로 올린다.
    console.error("[gcsState] DB 를 뜨지 못해 **올리지 않습니다** — "
                  + "버킷의 판을 덮지 않으려는 것입니다:", err);
    try { fs.rmSync(뜬것, { force: true }); } catch { /* 없으면 그만 */ }
    return null;
  }
}

/** 로컬 디스크 상태(DB/생성된 이미지/claude 로그인 정보 등)를 버킷에 다시 올린다. */
export async function uploadState(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const root = config.paths.dataDir;
  if (!fs.existsSync(root)) return;

  const dbRel = path.relative(root, config.paths.dbFile);
  const 곁파일 = DB_SIDE_FILES.map((끝) => dbRel + 끝);
  const relPaths = listLocalFiles(root, root).filter(
    (rel) => rel !== dbRel && !곁파일.includes(rel)
             && !rel.endsWith(".snapshot") && !건너뛸것(rel),
  );

  const 뜬것 = await 성한DB한벌();
  try {
    await 나눠서(relPaths, AT_ONCE,
                 (rel) => bucket.upload(path.join(root, rel), { destination: rel }));
    if (뜬것) { await bucket.upload(뜬것, { destination: dbRel }); }
  } finally {
    if (뜬것) { try { fs.rmSync(뜬것, { force: true }); } catch { /* 이미 없으면 그만 */ } }
  }
}
