/**
 * 고른 AI 를 실제로 불러 답을 받아 온다.
 *
 * 어느 회사 것이든 **명령 도구를 자식 프로세스로 띄워 JSON 을 받는** 꼴은
 * 같다. 다른 것은 인자 모양과 답 봉투뿐이라, 그 둘만 `engines.ts` 가 안다.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { getSetting, setSetting } from "../db/repositories/settings.js";
import { 엔진, type Engine, type RunAsk } from "./engines.js";
import { 로그인맞추기 } from "../persistence/gcsState.js";

/** «어느 엔진을 골랐나» 를 적어 두는 설정 칸 이름. */
const 엔진칸 = "ai_engine";

/**
 * 지금 고른 엔진. 안 고르셨으면 Claude.
 *
 * `AI_ENGINE` 을 넣어 두면 그것이 이긴다. 화면을 안 거치고 시험해 볼 때와,
 * 설정 화면 없이 환경변수로만 굴리고 싶을 때를 위한 자리다.
 */
export function 지금엔진(): Engine {
  const 밖에서 = (process.env.AI_ENGINE || "").trim();
  if (밖에서) return 엔진(밖에서);
  return 엔진(getSetting(엔진칸) ?? undefined);
}

/**
 * 이 엔진에 딸린 API 키. 대시보드에 저장된 값이 먼저고, 없으면 환경변수.
 *
 * 이미지 키들과 같은 규칙이다 — 화면에서 넣은 값이 배포 설정보다 세다.
 */
export function 엔진키(것: Engine): string {
  const 저장된 = (getSetting(것.auth.settingKey) ?? "").trim();
  if (저장된) return 저장된;
  return (process.env[것.auth.envVar] ?? "").trim();
}

/**
 * 지금 이 엔진으로 글을 쓸 수 있는 상태인가. 못 쓰면 **왜인지**를 돌려준다.
 *
 * 로그인 폴더가 안 먹는 엔진(Gemini)에 키가 없으면, 실행해 봐야 41 로
 * 죽으면서 영문 스택이 나올 뿐이다. 그 전에 한국어로 잡아 준다.
 */
/** 고르신 모델. 비어 있으면 도구 기본값을 쓴다. */
export function 엔진모델(것: Engine): string {
  const 저장된 = (getSetting(것.modelSetting) ?? "").trim();
  if (저장된) return 저장된;
  return (process.env[`${것.id.toUpperCase()}_MODEL`] ?? "").trim();
}

export function 준비됐나(것: Engine = 지금엔진()): { ok: boolean; why: string } {
  if (것.auth.loginWorksOnServer) return { ok: true, why: "" };
  if (엔진키(것)) return { ok: true, why: "" };
  return {
    ok: false,
    why: `${것.label} 은(는) 서버에서 브라우저 로그인을 쓸 수 없어 `
       + `API 키가 있어야 합니다. ${것.auth.keyUrl} 에서 키를 받아 `
       + `설정 화면에 넣어 주세요.`,
  };
}

export function 엔진고르기(id: string): Engine {
  const 것 = 엔진(id);
  if (것.id !== id) throw new Error(`모르는 AI 입니다: ${id}`);
  const 전 = 지금엔진().id;
  setSetting(엔진칸, 것.id);
  if (전 !== 것.id) {
    // 언제 무엇에서 무엇으로 바뀌었는지 남긴다. «나는 늘 Claude 인데 왜
    // Codex 로 돌았나» 를 나중에 화면에서 바로 알 수 있게.
    setSetting(바뀐때칸, JSON.stringify({ from: 전, to: 것.id, at: new Date().toISOString() }));
    상태지우기();
  }
  return 것;
}

// ─────────────────────────────────────────── AI 연결 상태
//
// «지금 어느 AI 로, 연결이 되어 있는가» 를 화면 맨 위에 늘 보이게 하려는 것.
// 한 번 데였다 — 사장님은 늘 Claude 인 줄 아셨는데 서버는 Codex 로 바뀌어
// 있었고, 로그인도 안 된 Codex 로 체험 회원 글을 쓰다 401 로 멈췄다.
// 어디가 붙어 있는지 안 보이니 오류 창을 보고서야 알았다.
//
// 연결 테스트나 실제 글쓰기의 결과로 적는다. «로그인이 풀렸다» 처럼 **다시
// 해도 안 될 것**만 «끊김» 으로 적고, 시간 초과·답 모양 같은 한 번의
// 실패로는 끊김으로 적지 않는다.

const 상태칸 = "ai_status";
const 바뀐때칸 = "ai_engine_changed";

export interface AI상태 {
  engine: string;
  label: string;
  /** true 연결됨 · false 끊김 · null 아직 모름 */
  ok: boolean | null;
  at: string | null;
  why: string;
  changed: { from: string; to: string; at: string } | null;
}

/**
 * 적는 모양의 판. 판이 다르면 읽지 않는다.
 *
 * 1판은 «적는 그 순간의 엔진» 이름으로 적었다. 그래서 Codex 로 돌던 글이
 * 늦게 실패하는 사이 사장님이 Claude 로 바꾸고 연결 테스트까지 마치셨는데,
 * 뒤늦은 Codex 의 401 이 **Claude 의 끊김**으로 적혔다. 멀쩡한 Claude 가
 * 막혔다. 2판부터는 **실제로 돈 엔진** 이름으로 적는다. 1판은 버린다.
 */
const 상태판 = 2;

/**
 * @param 엔진id 실제로 돌았던 엔진. **적는 순간의 엔진이 아니다** — 그사이 바뀌었을 수 있다.
 */
export function 상태적기(ok: boolean, why = "", 엔진id: string = 지금엔진().id): void {
  setSetting(상태칸, JSON.stringify({
    v: 상태판, engine: 엔진id, ok, at: new Date().toISOString(), why: why.slice(0, 600),
  }));
}

export function 상태지우기(): void {
  setSetting(상태칸, "");
}

export function 지금상태(): AI상태 {
  const 것 = 지금엔진();
  let 적힌: { v?: number; engine?: string; ok?: boolean; at?: string; why?: string } = {};
  try { 적힌 = JSON.parse(getSetting(상태칸) || "{}"); } catch { 적힌 = {}; }
  let 바뀜: AI상태["changed"] = null;
  try { 바뀜 = JSON.parse(getSetting(바뀐때칸) || "null"); } catch { 바뀜 = null; }

  const 기본 = { engine: 것.id, label: 것.label, changed: 바뀜 };
  const 준비 = 준비됐나(것);
  if (!준비.ok) return { ...기본, ok: false, at: null, why: 준비.why };
  // 다른 엔진 때 적어 둔 것은 이 엔진의 상태가 아니다. 옛 판으로 적힌 것도 믿지 않는다.
  if (적힌.v !== 상태판 || 적힌.engine !== 것.id || typeof 적힌.ok !== "boolean") {
    return { ...기본, ok: null, at: null, why: "" };
  }
  return { ...기본, ok: 적힌.ok, at: 적힌.at ?? null, why: 적힌.why ?? "" };
}

/**
 * 글을 쓰기 전에 본다. **끊긴 것이 분명하면** 막는다.
 *
 * 막기 전에 저장통의 로그인을 한 번 맞춰 본다 — 사장님이 검은 창에서 다시
 * 로그인해 올리셨는데 [연결 테스트] 를 아직 안 누르셨을 수 있다. 새 로그인이
 * 왔으면 끊김 표시를 지우고 쓰게 둔다.
 */
export async function 쓸수있나(): Promise<AI상태> {
  let 상태 = 지금상태();
  if (상태.ok !== false) return 상태;
  const 것 = 지금엔진();
  if (!준비됐나(것).ok) return 상태;          // 키가 없는 것은 해 볼 것도 없다
  if (것.auth.loginWorksOnServer && (await 로그인맞추기(것.home, true)) > 0) {
    상태지우기();
    return 지금상태();
  }
  // **적힌 «끊김» 이 조금 지났으면, 막기 전에 한 번 직접 확인한다.**
  // 적어 둔 것 하나로 계속 막으면, 적힌 게 틀렸거나 그사이 고쳐졌을 때
  // 멀쩡한 AI 를 붙잡고 있게 된다. 짧은 «ok» 한 마디라 한도는 거의 안 든다.
  const 지난 = 상태.at ? Date.now() - new Date(상태.at).getTime() : Infinity;
  if (지난 > 다시볼간격_ms) {
    try {
      await runAI({ prompt: "연결 확인이다. 다른 설명 없이 'ok'라고만 답하라.", timeoutMs: 45_000 });
    } catch { /* runAI 가 결과를 적는다. 여기서는 그대로 둔다 */ }
    상태 = 지금상태();
  }
  return 상태;
}

/** 적힌 «끊김» 을 이만큼 지나면, 막기 전에 한 번 직접 확인한다. */
const 다시볼간격_ms = 2 * 60_000;

/**
 * 실행 파일 이름.
 *
 * `CLAUDE_BIN` 은 Claude 하나뿐이던 시절의 이름이다. 그때 배포한 서버들이
 * 아직 그 값을 들고 있어서, Claude 일 때는 계속 본다.
 */
function 실행파일(것: Engine): string {
  if (것.id === "claude" && config.claudeBin) return config.claudeBin;
  return 것.bin;
}

export interface RunOptions extends RunAsk {
  timeoutMs?: number;
  /** 저장통의 로그인을 간격과 상관없이 지금 맞춘다 ([연결 테스트]). */
  freshLogin?: boolean;
}

/**
 * 로그인이 **풀렸다**는 표시들. 도구마다 말이 다르다.
 * Codex 는 «401 Unauthorized», Claude 는 «Invalid API key · Please run /login» 따위.
 */
const 로그인풀림 = /\b401\b|unauthori[sz]ed|not logged in|please (run )?\/?login|login required|invalid (api key|token|refresh)|refresh token|token (has )?expired|authentication (failed|required)/i;

/**
 * 멈춘 까닭을 **사람 말로.** 로그인이 풀린 것이면 무엇을 하면 되는지 말한다.
 * 도구가 쏟아내는 경고 줄(«WARNING: …») 은 덜어 낸다 — 까닭을 가린다.
 */
export function 멈춘까닭(것: Engine, 코드: number | null, 탈난것: string): string {
  const 줄들 = 탈난것.split("\n").map((x) => x.trim())
    .filter((x) => x && !/^WARNING:/i.test(x) && !/^Reading additional input/i.test(x));
  const 원문 = [...new Set(줄들)].join("\n").slice(0, 800);
  if (로그인풀림.test(탈난것)) {
    const 폴더 = 것.home;
    return `${것.label} 로그인이 풀렸습니다 (만료됐거나 다른 곳에서 로그아웃됨). `
      + `서버 주인이 검은 창에서 다시 로그인해 저장통에 올린 뒤 `
      + `[관리자 설정 → 1단계 → 연결 테스트] 를 누르면 됩니다 — 설치 안내서 4단계 [나] 의 ③·④ `
      + `(${것.login} → gs://…/home/${폴더} 로 올리기). 서버를 다시 켤 필요는 없습니다.`
      + (원문 ? `\n\n[원문] ${원문.split("\n")[0]}` : "");
  }
  return `${것.label} 이 ${코드} 로 멈췄습니다: ${원문}`;
}

/**
 * 한 번 부를 때 기다려 줄 시간.
 *
 * 240초로 잡아 두었다가 데었다. 뉴스형 카테고리는 웹 검색을 먼저 돌고
 * 그다음에 긴 글을 쓰기 때문에 4분으로는 모자란다. Cloud Run 쪽은
 * 1800초까지 기다리게 해 두었으니 거기가 병목이 아니었다.
 *
 * 환경변수로 조절할 수 있게 둔다 — 느린 모델을 쓰시는 분이 코드를
 * 고치지 않고도 늘릴 수 있어야 한다.
 */
export const 기본기다림 = (() => {
  const 밖 = Number(process.env.AI_TIMEOUT_MS);
  return Number.isFinite(밖) && 밖 > 0 ? 밖 : 600_000;
})();

/** 이 탈이 «시간이 다 된 것» 인가. */
export function 시간초과인가(탈: unknown): boolean {
  return !!(탈 as { 시간초과?: boolean })?.시간초과;
}

/**
 * **AI 를 빈 폴더에서 돌린다.**
 *
 * 이 명령 도구들은 「지금 있는 폴더」 를 제 작업 폴더로 삼는다. 거기 있는
 * 파일을 훑고, 목차를 만들고, 필요하면 읽는다. 원래 코드를 고치라고 만든
 * 물건이니 당연한 동작이다.
 *
 * 그런데 우리 서버가 도는 자리는 `/app` — **소스 코드와 node_modules 가
 * 통째로 있는 곳**이다. 폴더를 안 정해 주었더니 그걸 다 제 작업 폴더로
 * 삼고 있었다. 파일이 수만 개다.
 *
 * 탈이 셋이다.
 *
 *   느리다   글 하나 쓰자고 남의 폴더를 훑는다. 「ok 라고만 답해」
 *            여덟 글자에 들어간 입력이 9,252 토큰이었다.
 *   샌다     우리 소스 코드가 남의 서버로 올라간다. 팔 물건이다.
 *   막힌다   「믿을 만한 폴더가 아니다」 관문이 여기서 나왔다.
 *
 * 글을 쓰는 데 파일은 필요 없다. 빈 방을 하나 내어 주고 거기서 돌린다.
 */
function 일터(것: Engine): string {
  const 방 = path.join(config.paths.dataDir, "ai-work", 것.id);
  fs.mkdirSync(방, { recursive: true });
  return 방;
}

/**
 * 키로 도는 엔진에는 **깨끗한 집(HOME)을 따로 차려 준다.**
 *
 * 저장통에서 내려온 집에는 예전에 검은 창에서 로그인하며 남긴 설정이
 * 들어 있을 수 있다. 그 설정이 환경변수를 이기기 때문에, 키를 아무리
 * 잘 넘겨도 무시당한다. 그래서 그 집을 쓰지 않고 우리 집을 쓴다.
 *
 * 매번 새로 쓴다. 한 번 잘못 들어간 값이 남아 계속 말썽을 부리는 쪽이
 * 훨씬 나쁘다.
 */
function 집차리기(것: Engine): string {
  const 집 = path.join(config.paths.dataDir, "ai-home", 것.id);
  const 설정 = 것.auth.settings;
  if (설정) {
    const 자리 = path.join(집, 설정.path);
    fs.mkdirSync(path.dirname(자리), { recursive: true });
    fs.writeFileSync(자리, JSON.stringify(설정.body, null, 2));
  } else {
    fs.mkdirSync(집, { recursive: true });
  }
  return 집;
}

export async function runAI(options: RunOptions): Promise<string> {
  const 것 = 지금엔진();
  const 기다림 = options.timeoutMs ?? 기본기다림;
  const 파일 = 실행파일(것);

  // 답을 파일로 받는 엔진(Codex)에는 받을 자리를 만들어 준다.
  const 답자리 = 것.wantsOutFile
    ? path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ai-")), "answer.txt")
    : "";
  const 물음: RunAsk = { ...options, model: 엔진모델(것) || undefined };
  if (답자리) 물음.outFile = 답자리;
  const 인자 = 것.args(물음);

  const 준비 = 준비됐나(것);
  if (!준비.ok) throw new Error(준비.why);

  // 로그인으로 도는 엔진(Claude·Codex)은 **저장통의 로그인과 먼저 맞춘다.**
  // 사장님이 새로 로그인해 올렸으면 서버를 다시 켜지 않아도 바로 쓴다.
  if (것.auth.loginWorksOnServer && (await 로그인맞추기(것.home, !!options.freshLogin)) > 0) {
    상태지우기();   // 새 로그인이 왔다. 옛 «끊김» 은 더 이상 맞지 않다
  }

  // 키는 **자식에게만** 넘긴다. 우리 프로세스의 환경을 바꾸면 다른 엔진을
  // 고르셨을 때 남은 키가 따라다닌다.
  const 환경 = { ...process.env };
  const 키 = 엔진키(것);
  if (키) 환경[것.auth.envVar] = 키;
  if (!것.auth.loginWorksOnServer) 환경.HOME = 집차리기(것);
  Object.assign(환경, 것.headlessEnv ?? {});

  const stdout = await new Promise<string>((resolve, reject) => {
    const 아이 = spawn(파일, 인자, {
      stdio: ["ignore", "pipe", "pipe"],
      env: 환경,
      cwd: 일터(것),
    });
    let 나온것 = "";
    let 탈난것 = "";
    let 끝났나 = false;

    const 시계 = setTimeout(() => {
      if (끝났나) return;
      끝났나 = true;
      아이.kill("SIGKILL");
      // «시간이 다 됐다» 는 다른 실패와 성격이 다르다. 답이 틀린 게 아니라
      // 아직 안 온 것이다. 부르는 쪽이 그걸 알아야 **다시 부르지 않는다.**
      const 탈 = new Error(
        `${것.label} 이 ${Math.round(기다림 / 1000)}초 안에 답하지 않았습니다. `
        + `글이 길거나 웹 검색이 필요한 카테고리면 오래 걸립니다.`,
      ) as Error & { 시간초과?: boolean };
      탈.시간초과 = true;
      reject(탈);
    }, 기다림);

    아이.stdout.on("data", (c) => { 나온것 += c; });
    아이.stderr.on("data", (c) => { 탈난것 += c; });

    아이.on("error", (탈) => {
      if (끝났나) return;
      끝났나 = true; clearTimeout(시계);
      // 제일 흔한 탈이다 — 설치가 안 됐다. 그걸 «ENOENT» 로만 말하면
      // 무엇을 해야 할지 알 수가 없다.
      const 없음 = (탈 as NodeJS.ErrnoException).code === "ENOENT";
      const 왜 = 없음
        ? `${것.label} 이 이 서버에 설치돼 있지 않습니다. 「${것.install}」 를 먼저 하세요.`
        : 탈.message;
      if (없음) 상태적기(false, 왜, 것.id);
      reject(new Error(왜));
    });

    아이.on("close", (코드) => {
      if (끝났나) return;
      끝났나 = true; clearTimeout(시계);
      if (코드 !== 0) {
        const 까닭 = 멈춘까닭(것, 코드, 탈난것);
        // 로그인이 풀린 것은 다시 해도 안 된다. 끊김으로 적어 다음 글을 막는다.
        if (로그인풀림.test(탈난것)) 상태적기(false, 까닭, 것.id);
        reject(new Error(까닭));
        return;
      }
      상태적기(true, "", 것.id);
      resolve(나온것);
    });
  });

  let 파일글 = "";
  if (답자리) {
    try { 파일글 = fs.readFileSync(답자리, "utf8"); } catch { /* 비어 있을 수 있다 */ }
    try { fs.rmSync(path.dirname(답자리), { recursive: true, force: true }); } catch { /* 치우다 실패해도 답은 답이다 */ }
  }
  return 것.answer(stdout, 파일글);
}
