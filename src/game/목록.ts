/**
 * 🎯 게임 미션 목록 — 게임 속 목록 창 사진을 읽어 «할 수 있는 것부터» 줄 세운다 (GAME_PLAN 15-6).
 *
 * 순서: ① 진행중 → ② 진행가능(메인 → 서브 → 일일 → 기타, 같은 종류는 게임 목록 순서)
 *       → ③ 조건미달(조건이 쉬운 것 — 레벨이 낮은 것부터) → ④ 확인필요 → ⑤ 완료
 * 확신이 0.7 보다 낮거나 이름이 잘린 줄은 «확인필요». 사람이 확인한 줄은 다시 읽어도 덮어쓰지 않는다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runAI } from "../ai/run.js";
import { parseJsonLoose } from "../claude/parseResponse.js";
import type { 게임프로필 } from "./프로필.js";

export const 목록상태 = ["진행중", "진행가능", "조건미달", "완료", "확인필요"] as const;
export const 목록종류 = ["메인", "서브", "일일", "기타"] as const;

export interface 목록줄 {
  이름: string;
  종류: (typeof 목록종류)[number];
  상태: (typeof 목록상태)[number];
  조건: string;
  확신: number;
}

export const 확신기준 = 0.7;

function 잘렸나(이름: string): boolean {
  return /…|\.\.\.|■|\?\?/.test(이름) || 이름.length < 2;
}

export function 목록읽기(원문: string): 목록줄[] {
  let 값: { 목록?: unknown[] } | null = null;
  try { 값 = parseJsonLoose(원문) as { 목록?: unknown[] } | null; } catch { /* 못 읽으면 빈 목록 */ }
  const 줄들 = Array.isArray(값?.목록) ? 값!.목록 : [];
  return 줄들.flatMap((r) => {
    const o = r as Record<string, unknown>;
    const 이름 = String(o.이름 ?? "").trim().slice(0, 60);
    if (!이름) return [];
    const 종류 = (목록종류 as readonly string[]).includes(String(o.종류)) ? String(o.종류) : "기타";
    let 상태 = (목록상태 as readonly string[]).includes(String(o.상태)) ? String(o.상태) : "확인필요";
    const 확신 = Math.max(0, Math.min(1, Number(o.확신) || 0));
    if (확신 < 확신기준 || 잘렸나(이름)) 상태 = "확인필요";
    return [{ 이름, 종류, 상태, 조건: String(o.조건 ?? "").trim().slice(0, 60), 확신 } as 목록줄];
  });
}

const 상태순 = { 진행중: 0, 진행가능: 1, 조건미달: 2, 확인필요: 3, 완료: 4 } as Record<string, number>;
const 종류순 = { 메인: 0, 서브: 1, 일일: 2, 기타: 3 } as Record<string, number>;

/** 조건이 쉬운 정도 — «레벨 30» 이면 30. 숫자가 없으면 뒤로. */
function 조건무게(조건: string): number {
  const m = 조건.match(/(\d+)/);
  return m ? Number(m[1]) : 9999;
}

/** 줄 세우기 값. 작을수록 위. */
export function 정렬값(줄: { 상태: string; 종류: string; 조건: string; 게임순서: number }): number {
  const 상태 = 상태순[줄.상태] ?? 3;
  const 순서 = Math.min(Math.max(0, 줄.게임순서), 999);
  const 둘째 = 줄.상태 === "조건미달"
    ? Math.min(조건무게(줄.조건), 9999) * 1000 + 순서
    : (종류순[줄.종류] ?? 3) * 1000 + 순서;
  return 상태 * 100_000_000 + 둘째;
}

export function 목록지시문(프로필: 게임프로필, 사진파일들: string[], 한줄만 = ""): string {
  return `
[게임 목록 읽기]
게임: ${프로필.이름}
아래 사진${사진파일들.length > 1 ? `들(${사진파일들.length}장, 순서대로 이어지는 목록)` : ""}을 Read 도구로 열어
${한줄만 ? `퀘스트 «${한줄만}» 한 줄만 다시 읽어라(상세 창일 수 있다).` : "게임 속 퀘스트(미션) 목록 창을 위에서부터 한 줄씩 읽어라."}
${사진파일들.map((f, i) => `사진 ${i + 1}: ${f}`).join("\n")}

- 종류: 메인|서브|일일|기타 — 화면 표시 그대로
- 상태: 진행중|진행가능|조건미달|완료
- 조건: «레벨 30 필요» 같은 한 줄. 없으면 빈칸
- 확신: 0~1. 글자가 잘리거나 흐려 자신 없으면 낮게. 이름을 지어내지 마라

최종 답변은 다른 설명 없이 순수 JSON 하나로만:
{"목록":[{"이름":"…","종류":"메인","상태":"진행가능","조건":"","확신":0.9}]}
`.trim();
}

/** 목록 사진(여러 장)을 AI 로 읽는다. 사진은 끝나면 지운다. */
export async function 목록사진읽기(프로필: 게임프로필, 사진들: Buffer[], 한줄만 = "", 가상힌트: unknown = null): Promise<목록줄[]> {
  const 폴더 = fs.mkdtempSync(path.join(os.tmpdir(), "game-list-"));
  try {
    const 파일들 = 사진들.map((b, i) => { const f = path.join(폴더, `list${i + 1}.webp`); fs.writeFileSync(f, b); return f; });
    let 지시 = 목록지시문(프로필, 파일들, 한줄만);
    if (가상힌트) 지시 += `\n가상 게임 목록 힌트(시험용): ${JSON.stringify(가상힌트)}`;
    const 원문 = await runAI({ prompt: 지시, readDir: 폴더, timeoutMs: 120_000 });
    return 목록읽기(원문);
  } finally {
    fs.rmSync(폴더, { recursive: true, force: true });
  }
}
