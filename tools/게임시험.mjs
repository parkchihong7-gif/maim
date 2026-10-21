#!/usr/bin/env node
// 🕹️ 게임 플레이 «게임 없이» 시험 — 회사 PC(윈도)·맥·리눅스 어디서나 명령 하나로.
//
//   node tools/게임시험.mjs            서버(가짜 AI) + 집 PC 프로그램(가상 게임, 빠르게) 같이 켜기
//   node tools/게임시험.mjs --금지      가상 게임에 «상점» 화면을 끼워 즉시 정지 시험
//   node tools/게임시험.mjs --서버만     서버만 (집 PC 프로그램은 다른 창에서 직접)
//
// 켜지면 브라우저로 http://127.0.0.1:8793 → 접속키 칸에 owner-test-token-local → 🕹️ 게임 플레이.
// 진짜 AI·진짜 게임·운영 서버는 건드리지 않는다. 데이터는 data/game-test 폴더에만 쌓인다(지우면 처음부터).
// 끄기: 이 창에서 Ctrl+C.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const 뿌리 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const 인자 = process.argv.slice(2);
const 포트 = "8793";
const 자료 = path.join(뿌리, "data", "game-test");
fs.mkdirSync(자료, { recursive: true });
const 토큰 = { 주인: "owner-test-token-local", 집PC: "agent-test-token-local" };

const 서버환경 = {
  ...process.env,
  PORT: 포트, HOST: "127.0.0.1", DATA_DIR: 자료,
  DASHBOARD_TOKEN: 토큰.주인, GAME_AGENT_TOKEN: 토큰.집PC,
  GAME_SHOT_BUCKET: `local:${path.join(자료, "shots")}`,
  CLAUDE_BIN: path.join(뿌리, "tools", "fake-claude.mjs"), AI_ENGINE: "claude",
  GCS_STATE_BUCKET: "", KEYSERVER_URL: "",
};
const 윈도 = process.platform === "win32";
const tsx = path.join(뿌리, "node_modules", ".bin", 윈도 ? "tsx.cmd" : "tsx");
if (!fs.existsSync(tsx)) { console.error("먼저 저장소 폴더에서 npm install 을 해 주세요."); process.exit(1); }

const 아이들 = [];
const 끄기 = () => { for (const a of 아이들) { try { a.kill(); } catch { /* 이미 꺼짐 */ } } process.exit(0); };
process.on("SIGINT", 끄기);

console.log("▶ 서버 켜는 중 (가짜 AI, 사진은 data/game-test/shots) …");
const 서버 = spawn(윈도 ? `"${tsx}"` : tsx, [path.join("src", "index.ts")], { cwd: 뿌리, env: 서버환경, stdio: ["ignore", "pipe", "inherit"], shell: 윈도 });
아이들.push(서버);
서버.stdout.on("data", (b) => { const 글 = String(b); if (/error|탈|실패/i.test(글)) process.stdout.write(`[서버] ${글}`); });
서버.on("exit", (c) => { console.log(`서버가 꺼졌습니다 (${c}).`); 끄기(); });

async function 기다리기() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${포트}/api/health`); if (r.ok) return true; } catch { /* 아직 */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function 파이썬() {
  for (const [명령, 앞] of [["python", []], ["py", ["-3"]], ["python3", []]]) {
    const r = spawnSync(명령, [...앞, "--version"], { encoding: "utf8", shell: 윈도 });
    if (r.status === 0) return [명령, 앞];
  }
  return null;
}

if (!(await 기다리기())) { console.error("서버가 60초 안에 뜨지 않았습니다."); 끄기(); }
console.log(`
✅ 서버 준비 — 브라우저로 http://127.0.0.1:${포트}
   접속키 칸에 «${토큰.주인}» → 왼쪽 메뉴 🕹️ 게임 플레이
   (메뉴가 안 보이면 [블로그 관리] 에서 이름에 «게임» 이 들어간 카테고리를 하나 만드세요)
`);
if (인자.includes("--서버만")) {
  console.log(`집 PC 프로그램은 다른 창에서:\n  cd agent\n  set MAIM_SERVER_URL=http://127.0.0.1:${포트}\n  set MAIM_GAME_AGENT_TOKEN=${토큰.집PC}\n  python main.py --가상 --빠르게`);
} else {
  const py = 파이썬();
  if (!py) { console.error("Python 을 찾지 못했습니다. docs/game/회사PC-시험.md 1번대로 설치해 주세요. (서버는 켜 둡니다)"); }
  else {
    console.log("▶ 집 PC 프로그램(가상 게임) 켜는 중 … 대시보드에서 [▶ 게임 실행] 을 누르면 시작합니다.\n");
    const 집 = spawn(py[0], [...py[1], "main.py", "--가상", "--빠르게", ...(인자.includes("--금지") ? ["--금지"] : [])], {
      cwd: path.join(뿌리, "agent"), stdio: "inherit", shell: 윈도,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", MAIM_SERVER_URL: `http://127.0.0.1:${포트}`, MAIM_GAME_AGENT_TOKEN: 토큰.집PC, MAIM_GAME_ROOT: path.join(자료, "agent") },
    });
    아이들.push(집);
    집.on("exit", (c) => console.log(`집 PC 프로그램이 꺼졌습니다 (${c}). 서버는 켜 둡니다 — Ctrl+C 로 끕니다.`));
  }
}
