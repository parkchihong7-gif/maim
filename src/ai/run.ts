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
  setSetting(엔진칸, 것.id);
  return 것;
}

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

  // 키는 **자식에게만** 넘긴다. 우리 프로세스의 환경을 바꾸면 다른 엔진을
  // 고르셨을 때 남은 키가 따라다닌다.
  const 환경 = { ...process.env };
  const 키 = 엔진키(것);
  if (키) 환경[것.auth.envVar] = 키;
  if (!것.auth.loginWorksOnServer) 환경.HOME = 집차리기(것);
  Object.assign(환경, 것.headlessEnv ?? {});

  const stdout = await new Promise<string>((resolve, reject) => {
    const 아이 = spawn(파일, 인자, { stdio: ["ignore", "pipe", "pipe"], env: 환경 });
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
      const 왜 = (탈 as NodeJS.ErrnoException).code === "ENOENT"
        ? `${것.label} 이 이 서버에 설치돼 있지 않습니다. 「${것.install}」 를 먼저 하세요.`
        : 탈.message;
      reject(new Error(왜));
    });

    아이.on("close", (코드) => {
      if (끝났나) return;
      끝났나 = true; clearTimeout(시계);
      if (코드 !== 0) {
        reject(new Error(`${것.label} 이 ${코드} 로 멈췄습니다: ${탈난것.slice(0, 1500)}`));
        return;
      }
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
