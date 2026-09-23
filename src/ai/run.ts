/**
 * 고른 AI 를 실제로 불러 답을 받아 온다.
 *
 * 어느 회사 것이든 **명령 도구를 자식 프로세스로 띄워 JSON 을 받는** 꼴은
 * 같다. 다른 것은 인자 모양과 답 봉투뿐이라, 그 둘만 `engines.ts` 가 안다.
 */

import { spawn } from "node:child_process";
import { config } from "../config.js";
import { getSetting, setSetting } from "../db/repositories/settings.js";
import { 엔진, type Engine, type RunAsk } from "./engines.js";

const 엔진키 = "ai_engine";

/**
 * 지금 고른 엔진. 안 고르셨으면 Claude.
 *
 * `AI_ENGINE` 을 넣어 두면 그것이 이긴다. 화면을 안 거치고 시험해 볼 때와,
 * 설정 화면 없이 환경변수로만 굴리고 싶을 때를 위한 자리다.
 */
export function 지금엔진(): Engine {
  const 밖에서 = (process.env.AI_ENGINE || "").trim();
  if (밖에서) return 엔진(밖에서);
  return 엔진(getSetting(엔진키) ?? undefined);
}

export function 엔진고르기(id: string): Engine {
  const 것 = 엔진(id);
  if (것.id !== id) throw new Error(`모르는 AI 입니다: ${id}`);
  setSetting(엔진키, 것.id);
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

export async function runAI(options: RunOptions): Promise<string> {
  const 것 = 지금엔진();
  const 인자 = 것.args(options);
  const 기다림 = options.timeoutMs ?? 180_000;
  const 파일 = 실행파일(것);

  const stdout = await new Promise<string>((resolve, reject) => {
    const 아이 = spawn(파일, 인자, { stdio: ["ignore", "pipe", "pipe"] });
    let 나온것 = "";
    let 탈난것 = "";
    let 끝났나 = false;

    const 시계 = setTimeout(() => {
      if (끝났나) return;
      끝났나 = true;
      아이.kill("SIGKILL");
      reject(new Error(`${것.label} 이 ${Math.round(기다림 / 1000)}초 안에 답하지 않았습니다.`));
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

  return 것.answer(stdout);
}
