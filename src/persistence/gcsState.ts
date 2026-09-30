import { Storage } from "@google-cloud/storage";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

let storage: Storage | undefined;

/** 시험에서 가짜 저장통을 끼울 자리. 평소에는 비어 있다. */
let 시험용통: ReturnType<Storage["bucket"]> | undefined;
export function 시험용통바꾸기(통: unknown): void {
  시험용통 = 통 as ReturnType<Storage["bucket"]> | undefined;
}

function getBucket() {
  if (시험용통) return 시험용통;
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
 * **파일마다 «마지막으로 맞춰 본 판».** 한 번 데였다.
 *
 * 예전에는 60초마다 로컬의 파일을 **전부** 버킷에 다시 올렸다. 바뀌지 않은
 * 것까지. 그러다 AI 로그인 파일(`home/.codex/auth.json` 등)이 이렇게 망가졌다.
 *
 *   1. 사장님이 검은 창에서 새로 로그인하고 저장통에 올린다
 *   2. 돌고 있던 서버는 그걸 모른다 — 시작할 때 한 번만 내려받기 때문이다
 *   3. 60초 뒤, 그 서버가 **자기가 들고 있던 옛 로그인**을 도로 올린다
 *   4. 새 로그인이 덮여 사라진다. AI 는 만료된 표로 401 을 받는다
 *
 * 배포할 때도 같다. 옛 서버가 꺼지면서 옛 로그인을 올려 새 것을 덮는다.
 *
 * 그래서 파일마다 버킷의 판 번호(generation)와 로컬의 크기·수정 시각을
 * 적어 둔다. **로컬에서 바뀐 것만** 올리고, 올릴 때도 «버킷이 내가 알던 그
 * 판일 때만» 올린다. 그사이 누가 버킷을 새로 바꿨으면 버킷 쪽을 믿는다.
 */
interface 맞춘판 { gen: string; size: number; mtimeMs: number }
const 알던판 = new Map<string, 맞춘판>();

function 로컬모양(localPath: string): { size: number; mtimeMs: number } | null {
  try { const s = fs.statSync(localPath); return { size: s.size, mtimeMs: s.mtimeMs }; }
  catch { return null; }
}

function 적어두기(rel: string, gen: unknown, localPath: string): void {
  const 모양 = 로컬모양(localPath);
  if (모양 && gen !== undefined && gen !== null) 알던판.set(rel, { gen: String(gen), ...모양 });
}

/** 로그인 정보가 든 자리. 여기는 **버킷을 먼저 믿는다** — 사람이 바꾸는 곳이다. */
const 로그인자리 = "home/";

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
    적어두기(file.name, file.metadata.generation, localPath);
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
    await 나눠서(relPaths, AT_ONCE, (rel) => 바뀐것만올리기(bucket, root, rel));
    if (뜬것) { await bucket.upload(뜬것, { destination: dbRel }); }
  } finally {
    if (뜬것) { try { fs.rmSync(뜬것, { force: true }); } catch { /* 이미 없으면 그만 */ } }
  }
}

type 통 = NonNullable<ReturnType<typeof getBucket>>;

/**
 * 로컬에서 **바뀐 파일만** 올린다. 버킷이 그사이 다른 판이 됐으면 덮지 않는다.
 */
async function 바뀐것만올리기(bucket: 통, root: string, rel: string): Promise<void> {
  const localPath = path.join(root, rel);
  const 지금모양 = 로컬모양(localPath);
  if (!지금모양) return;
  const 알던 = 알던판.get(rel);
  if (알던 && 알던.size === 지금모양.size && 알던.mtimeMs === 지금모양.mtimeMs) return;

  // 로그인 파일은 «내가 알던 판일 때만» 덮는다. 모르는 파일이면 «아직 없을
  // 때만» 만든다. 그사이 사람이 새로 올렸으면 여기서 멈추고 그쪽을 받는다.
  const 조건 = rel.startsWith(로그인자리)
    ? { preconditionOpts: { ifGenerationMatch: 알던 ? Number(알던.gen) : 0 } }
    : {};
  try {
    const [올린것] = await bucket.upload(localPath, { destination: rel, ...조건 });
    적어두기(rel, 올린것.metadata.generation, localPath);
  } catch (탈) {
    const 코드 = (탈 as { code?: number }).code;
    if (코드 === 412) {
      console.log(`[gcsState] ${rel} — 버킷에 더 새 판이 있어 덮지 않고 그쪽을 받습니다.`);
      const 파일 = bucket.file(rel);
      await 파일.download({ destination: localPath });
      const [메타] = await 파일.getMetadata();
      적어두기(rel, 메타.generation, localPath);
      return;
    }
    throw 탈;
  }
}

/** 엔진별로 마지막으로 버킷을 들여다본 때. 글 한 편에 여러 번 부르므로 잦게 보지 않는다. */
const 마지막확인 = new Map<string, number>();
const 확인간격_ms = 20_000;

/**
 * **AI 로그인 폴더를 버킷과 맞춘다.** AI 를 부르기 바로 전에 쓴다.
 *
 * 사장님이 검은 창에서 새로 로그인해 저장통에 올리면, 서버를 다시 켜지 않아도
 * 다음 글부터 그 로그인을 쓴다. 버킷의 판이 내가 알던 것과 다른 파일만 받는다.
 *
 * @param 폴더 `.codex` 처럼 HOME 아래 로그인 폴더 이름
 * @param 꼭 true 면 간격과 상관없이 지금 본다 ([연결 테스트] 등)
 */
export async function 로그인맞추기(폴더: string, 꼭 = false): Promise<number> {
  const bucket = getBucket();
  if (!bucket || !폴더) return 0;
  const 지금 = Date.now();
  if (!꼭 && 지금 - (마지막확인.get(폴더) ?? 0) < 확인간격_ms) return 0;
  마지막확인.set(폴더, 지금);

  const 앞 = `${로그인자리}${폴더.replace(/^\/+|\/+$/g, "")}/`;
  let 받은수 = 0;
  try {
    const [files] = await bucket.getFiles({ prefix: 앞 });
    for (const file of files) {
      if (건너뛸것(file.name) || file.name.endsWith("/")) continue;
      const gen = String(file.metadata.generation ?? "");
      if (알던판.get(file.name)?.gen === gen) continue;
      const localPath = path.join(config.paths.dataDir, file.name);
      fs.mkdirSync(path.dirname(localPath), { recursive: true });
      await file.download({ destination: localPath });
      적어두기(file.name, gen, localPath);
      받은수++;
    }
    if (받은수) console.log(`[gcsState] ${앞} 새 로그인 ${받은수}개를 받았습니다.`);
  } catch (탈) {
    // 못 봤다고 AI 를 못 부를 까닭은 없다. 들고 있는 것으로 해 본다.
    console.error(`[gcsState] ${앞} 를 맞추지 못했습니다:`, (탈 as Error).message);
  }
  return 받은수;
}
