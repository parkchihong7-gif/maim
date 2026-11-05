/**
 * **카테고리 핵심 키워드 자동 채우기** 를 시험한다 — ①주제·②설명만으로
 * AI 가 ③주제 키워드·④함께 들어갈 말을 뽑아 주는 기능.
 *
 *     npx tsx tests/test-카테고리키워드추출.ts
 *
 * 인터넷은 필요 없다(가짜 AI).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-kwx-"));
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
const 답 = { topicKeyword: "스타듀밸리 농사 꿀팁", mustKeywords: ["작물", "스프링클러", "수확"] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(답) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-kwx";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const K = await import("../src/claude/카테고리키워드추출.js");
const { buildServer } = await import("../src/web/server.js");
const { 상태적기 } = await import("../src/ai/run.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");

getDb();
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① 지시문 — 이름·설명·기존 값을 담아 짧은 JSON 을 요청한다");
const prompt = K.buildKeywordSuggestPrompt("게임 공략", "스타듀밸리 농사 공략 정리", "", "");
참("이름이 들어간다", prompt.includes('주제: "게임 공략"'));
참("설명이 들어간다", prompt.includes('설명: "스타듀밸리 농사 공략 정리"'));
참("순수 JSON 만 달라고 한다", prompt.includes('{"topicKeyword"'));

console.log("\n② 키워드제안받기 — 가짜 AI 답을 읽어 topicKeyword·mustKeywords 로 돌려준다");
상태적기(true, "", "claude");
const 제안 = await K.키워드제안받기("게임 공략", "스타듀밸리 농사 공략 정리");
참("세부 키워드 조합을 돌려준다", 제안.topicKeyword === "스타듀밸리 농사 꿀팁");
참("연관 키워드는 쉼표로 합쳐 돌려준다(폼 입력칸 모양과 같게)", 제안.mustKeywords === "작물, 스프링클러, 수확");

console.log("\n③ API — 이름·설명 없으면 400, AI 끊기면 409, 체험은 403, 정상이면 200");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-kwx" };
const 체험머리 = { "x-dashboard-token": openSession({ key1: "T-1", key2: "T-1-PC", remoteToken: "r", role: "client" }) };

const 체험응답 = await app.inject({ method: "POST", url: "/api/categories/keyword-suggest", headers: 체험머리, payload: { name: "a", promptHint: "b" } });
참("체험 키는 403", 체험응답.statusCode === 403);

const 빈값응답 = await app.inject({ method: "POST", url: "/api/categories/keyword-suggest", headers: 주인, payload: { name: "", promptHint: "" } });
참("이름·설명이 비면 400", 빈값응답.statusCode === 400);

상태적기(false, "로그인이 풀렸습니다", "claude");
const 끊김응답 = await app.inject({ method: "POST", url: "/api/categories/keyword-suggest", headers: 주인, payload: { name: "게임 공략", promptHint: "스타듀밸리 농사 공략 정리" } });
참("AI 가 끊겨 있으면 409", 끊김응답.statusCode === 409 && 끊김응답.json().needsAi === true);

상태적기(true, "", "claude");
const 정상응답 = await app.inject({ method: "POST", url: "/api/categories/keyword-suggest", headers: 주인, payload: { name: "게임 공략", promptHint: "스타듀밸리 농사 공략 정리" } });
참("정상이면 200 과 제안값", 정상응답.statusCode === 200 && 정상응답.json().topicKeyword === "스타듀밸리 농사 꿀팁");

await app.close();
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
