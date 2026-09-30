/**
 * **AI 연결 상태 — 끊기면 글쓰기를 막고, 다시 붙으면 푼다.**
 *
 *     npx tsx tests/test-AI상태.ts
 *
 * 실제로 겪었다 — 서버가 모르는 새 Codex 로 바뀌어 있었고, 로그인 안 된
 * Codex 로 체험 회원 글을 쓰다 401 로 멈췄다. 어디가 붙어 있는지 안 보였다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-ai-"));
const 모드 = path.join(임시, "mode");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const m = fs.existsSync(${JSON.stringify(모드)}) ? fs.readFileSync(${JSON.stringify(모드)}, "utf8").trim() : "ok";
if (m === "401") { process.stderr.write("ERROR: HTTP error: 401 Unauthorized"); process.exit(1); }
if (m === "slow") { process.stderr.write("some other failure"); process.exit(3); }
process.stdout.write(JSON.stringify({ is_error: false, result: "ok" }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
delete process.env.AI_ENGINE;
for (const k of ["UNSPLASH_ACCESS_KEY", "PEXELS_API_KEY", "PIXABAY_API_KEY"]) delete process.env[k];

const { getDb } = await import("../src/db/index.js");
const R = await import("../src/ai/run.js");
const S = await import("../src/db/repositories/settings.js");
getDb();

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 부르기 = () => R.runAI({ prompt: "ok 라고만", timeoutMs: 10_000 }).then(() => true, () => false);

console.log("\n① 처음에는 모른다(null). 한 번 성공하면 «연결됨»");
참("처음은 null", R.지금상태().ok === null);
참("기본은 Claude", R.지금상태().engine === "claude");
await 부르기();
참("성공 뒤 연결됨", R.지금상태().ok === true);

console.log("\n② 401 이 나면 «끊김» 으로 적고 글쓰기를 막는다");
fs.writeFileSync(모드, "401");
await 부르기();
참("끊김", R.지금상태().ok === false);
참("까닭에 «로그인이 풀렸습니다»", R.지금상태().why.includes("로그인이 풀렸습니다"));
참("쓸수있나 도 끊김", (await R.쓸수있나()).ok === false);

console.log("\n③ 로그인과 상관없는 한 번의 실패로는 끊김으로 적지 않는다");
fs.writeFileSync(모드, "ok"); await 부르기();
fs.writeFileSync(모드, "slow"); await 부르기();
참("그대로 연결됨", R.지금상태().ok === true);

console.log("\n④ AI 를 바꾸면 상태는 다시 «모름», 언제 무엇에서 무엇으로 바뀌었는지 남는다");
R.엔진고르기("codex");
const 상태 = R.지금상태();
참("모름", 상태.ok === null);
참("Claude → Codex 기록", 상태.changed?.from === "claude" && 상태.changed?.to === "codex");
R.엔진고르기("claude");

console.log("\n⑤ 키가 없는 Gemini 는 부르기 전부터 끊김");
R.엔진고르기("gemini");
참("Gemini 키 없음 → 끊김", R.지금상태().ok === false && R.지금상태().why.includes("API 키"));
R.엔진고르기("claude");

console.log("\n⑦ 실제로 겪은 일 — 늦게 끝난 Codex 의 401 이 Claude 의 끊김으로 적히면 안 된다");
fs.writeFileSync(모드, "ok");
await 부르기();                                          // Claude 연결됨
참("Claude 연결됨", R.지금상태().ok === true);
R.상태적기(false, "Codex (OpenAI) 로그인이 풀렸습니다 … 401", "codex");  // 늦게 온 Codex 실패
참("Claude 는 그대로 연결됨으로 보인다", R.지금상태().ok !== false);
참("Codex 이야기가 Claude 상태에 안 섞였다", !R.지금상태().why.includes("Codex"));

console.log("\n⑧ 옛 판(1판)으로 적힌 «끊김» 은 믿지 않는다 — 배포하면 저절로 풀린다");
S.setSetting("ai_status", JSON.stringify({ engine: "claude", ok: false, at: new Date().toISOString(), why: "Codex 401" }));
참("옛 판 기록은 «모름»", R.지금상태().ok === null);

console.log("\n⑨ 적힌 «끊김» 이 2분 넘게 지났으면 막기 전에 직접 확인한다");
const 오래전 = new Date(Date.now() - 10 * 60_000).toISOString();
S.setSetting("ai_status", JSON.stringify({ v: 2, engine: "claude", ok: false, at: 오래전, why: "옛 끊김" }));
참("적힌 대로면 끊김", R.지금상태().ok === false);
const 확인 = await R.쓸수있나();
참("직접 확인해 보니 연결됨 → 막지 않는다", 확인.ok === true);

console.log("\n⑩ 방금 적힌 «끊김» 은 그대로 막는다 (매번 확인하느라 느려지지 않게)");
fs.writeFileSync(모드, "401");
await 부르기();
fs.writeFileSync(모드, "ok");
참("방금 끊김 → 막는다", (await R.쓸수있나()).ok === false);

console.log("\n⑥ 무료 이미지 키 — 하나도 없으면 0, 하나 넣으면 1");
참("처음은 0개", S.이미지키들().count === 0);
참("빠진 것 셋", S.이미지키들().missing.length === 3);
S.setSetting("pexels_api_key", "abc");
참("Pexels 하나 → 1개", S.이미지키들().count === 1 && S.이미지키들().set[0] === "Pexels");

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
