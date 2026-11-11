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
 *
 * 2026-11-04 — **최초 접속이 5분 걸리는 문제를 찾다가 추가.** `home/.claude/`
 * 는 Claude Code CLI(이 서버가 글을 쓸 때 돌리는 바로 그 도구)의 집이다.
 * 로그인에 필요한 건 설정·자격 증명 몇 개뿐인데, 그 도구는 부를 때마다
 * `projects/` 에 대화 기록(JSONL)을, `shell-snapshots/` 에 세션별 bash
 * 스냅샷을 쌓는다 — **몇 달치 자동 포스팅이 쌓이면 수천 개**가 된다. 그게
 * 60초마다 버킷에 올라갔다가, 다음에 서버가 켜질 때 **전부 다시 받아와야**
 * 했다. 로그인에는 하나도 안 쓰이는 파일들이 콜드 스타트를 수 분 붙잡고
 * 있었던 것 — 아래 넷을 더 끊는다. `.codex`·`.gemini` 도 같은 식으로 로그·
 * 세션 기록이 쌓이면 여기 추가하면 된다.
 */
const SKIP_PREFIXES = [
  "cash-flow/",                    // 통합 관리자 대시보드 몫
  "home/.claude/backups/",         // Claude CLI 가 쌓는 백업. 로그인에는 필요 없다
  "home/.claude/projects/",        // 세션 대화 기록(JSONL) — 로그인과 무관, 끝없이 자란다
  "home/.claude/shell-snapshots/", // 세션마다 뜨는 bash 스냅샷
  "home/.claude/statsig/",         // 사용량 집계 캐시
  "home/.claude/todos/",           // 세션 할 일 캐시
  "home/.claude/ide/",             // IDE 연결용 임시 파일
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

/** 시험에서만 쓴다 — 서로 다른 인스턴스가 «같은 DB를 다른 판으로 안다»는 상황을
 * 한 프로세스 안에서 재연하려고, 알던판을 강제로 되돌리는 용도. */
export function 시험용알던판적기(rel: string, gen: string, localPath: string): void {
  적어두기(rel, gen, localPath);
}

function 적어두기(rel: string, gen: unknown, localPath: string): void {
  const 모양 = 로컬모양(localPath);
  if (모양 && gen !== undefined && gen !== null) 알던판.set(rel, { gen: String(gen), ...모양 });
}

/** 로그인 정보가 든 자리. 여기는 **버킷을 먼저 믿는다** — 사람이 바꾸는 곳이다. */
const 로그인자리 = "home/";

/**
 * **서버가 요청을 받기 전에 반드시 있어야 하는 것 — DB 하나.** 파일 하나라 빠르다.
 *
 * 2026-11-04 전에는 `downloadState()` 가 DB 뿐 아니라 로그인 폴더(`home/`)까지
 * 전부 받은 **뒤에야** `app.listen()` 을 불렀다. 로그인 폴더가 쌓인 캐시로
 * 무거워지면(바로 위 SKIP_PREFIXES 설명 참고) 그동안 **화면이 아예 안 열렸다**
 * — 첫 접속이 5분 걸린 바로 그 증상이다. DB 는 화면·카테고리·이력을 보는 데
 * 당장 필요하지만, 로그인 폴더는 **AI 로 실제로 글을 쓸 때만** 필요하고
 * `src/ai/run.ts` 의 `로그인맞추기()` 가 그 호출 바로 전에 알아서 받아 온다.
 * 그러니 DB 만 먼저 받고 서버를 열면, 화면은 바로 뜨고 AI 쪽만 처음 한 번
 * 살짝 늦게 붙는다.
 */
export async function downloadEssentialState(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const root = config.paths.dataDir;
  fs.mkdirSync(root, { recursive: true });
  const dbRel = path.relative(root, config.paths.dbFile);
  const file = bucket.file(dbRel);
  try {
    fs.mkdirSync(path.dirname(config.paths.dbFile), { recursive: true });
    await file.download({ destination: config.paths.dbFile });
    const [meta] = await file.getMetadata();
    적어두기(dbRel, meta.generation, config.paths.dbFile);
    console.log(`[gcsState] DB 를 먼저 복원했습니다 (gs://${config.gcsStateBucket}/${dbRel}).`);
  } catch (err) {
    if ((err as { code?: number })?.code === 404) {
      console.log("[gcsState] 버킷에 DB 가 아직 없습니다 — 새로 시작합니다.");
    } else {
      console.error("[gcsState] DB 를 먼저 복원하지 못했습니다 — 빈 DB로 시작합니다:", err);
    }
  }
}

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
 *
 * **DB 는 여기서 다시 받지 않는다** — `downloadEssentialState()` 가 서버를
 * 열기 전에 이미 받아 두었고, 이 함수는 서버가 요청(쓰기 포함)을 받기
 * 시작한 **뒤**에 백그라운드로 돈다. 여기서 DB 를 한 번 더 내려받으면 그
 * 사이 들어온 쓰기를 옛 판으로 덮어 버린다.
 */
export async function downloadState(): Promise<void> {
  const bucket = getBucket();
  if (!bucket) return;
  const root = config.paths.dataDir;
  fs.mkdirSync(root, { recursive: true });
  const dbRel = path.relative(root, config.paths.dbFile);
  const [files] = await bucket.getFiles();
  const essential = files.filter(
    (file) => file.name !== dbRel && !file.name.startsWith(GENERATED_PREFIX) && !건너뛸것(file.name),
  );
  await 나눠서(essential, AT_ONCE, async (file) => {
    const localPath = path.join(root, file.name);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await file.download({ destination: localPath });
    적어두기(file.name, file.metadata.generation, localPath);
  });
  console.log(
    `[gcsState] gs://${config.gcsStateBucket}에서 ${essential.length}개 파일을 복원했습니다 ` +
      `(생성 이미지·DB 제외 ${files.length - essential.length}개는 건너뛰거나 이미 받았습니다).`,
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

/**
 * 건너뛸 자리(SKIP_PREFIXES)는 **들어가 보지도 않는다.** 그 아래 수천 개가
 * 쌓여 있어도, 60초마다 도는 업로드 훑기가 매번 그걸 다 읽을 필요는 없다
 * — 어차피 올리지 않을 걸 알고 있으니 폴더째 건너뛴다.
 */
function listLocalFiles(dir: string, root: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      if (건너뛸것(`${rel}/`)) continue;
      listLocalFiles(full, root, out);
    } else out.push(rel);
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
    if (뜬것) await DB올리기(bucket, 뜬것, dbRel);
  } finally {
    if (뜬것) { try { fs.rmSync(뜬것, { force: true }); } catch { /* 이미 없으면 그만 */ } }
  }
}

/**
 * **DB 도 로그인 파일처럼 «내가 알던 판일 때만» 덮는다.**
 *
 * 2026-11 — 인스턴스가 둘 떠 있던 사이(배포 전환·스케일아웃), 옛 DB를 들고
 * 있던 쪽이 60초 주기로 **묻지도 않고** 제 DB를 덮어 올려서, 그새 다른 쪽
 * 인스턴스가 저장했던 설정(무료 이미지 키 등)이 통째로 사라진 일이 있었다
 * — 로그인 파일에는 이미 있던 판 번호 검사가 DB 에는 없었던 탓이다.
 *
 * DB는 로그인 파일과 달리 충돌해도 «버킷 쪽을 믿고 받아오면» 안 된다 — 지금
 * 떠 있는 서버가 그 사이에 실제로 커밋한 쓰기(새 글·설정)를 통째로 잃는다.
 * 그래서 412 가 나면 받지 않고 **크게 알리기만** 한다 — `--max-instances=1`
 * 이 제대로 걸려 있으면 원래 일어날 수 없는 충돌이라, 사람이 봐야 하는 사고다.
 */
export async function DB올리기(bucket: 통, 로컬파일: string, dbRel: string): Promise<void> {
  const 알던 = 알던판.get(dbRel);
  try {
    const [올린것] = await bucket.upload(로컬파일, {
      destination: dbRel,
      preconditionOpts: { ifGenerationMatch: 알던 ? Number(알던.gen) : 0 },
    });
    적어두기(dbRel, 올린것.metadata.generation, config.paths.dbFile);
  } catch (탈) {
    if ((탈 as { code?: number }).code === 412) {
      const 말 = "[gcsState] ⚠️ DB 충돌 — 다른 인스턴스가 먼저 저장통에 DB를 올려 이번 "
        + "올리기는 건너뜁니다. 두 서버가 동시에 떠 있던 것으로 보입니다 "
        + "(배포 시 --max-instances=1 이 들어가 있는지 확인하세요). 방금 저장된 "
        + "설정·글이 사라졌다면 이게 원인일 수 있습니다.";
      console.error(말);
      try {
        const { 오류적기 } = await import("../db/repositories/errorLog.js");
        오류적기("gcsState", "db-conflict", 말);
      } catch { /* 오류 기록 자체가 실패해도 서버는 계속 돈다 */ }
      return;
    }
    throw 탈;
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
