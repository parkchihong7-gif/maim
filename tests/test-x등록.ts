/**
 * **📣 X 등록 탭** 을 시험한다 — 실제 발행 주소 등록(+해제)과 AI 요약
 * 생성·직접 수정, 그리고 체험 자리는 못 쓰는 것까지.
 *
 *     npx tsx tests/test-x등록.ts
 *
 * 인터넷은 필요 없다(가짜 AI).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-xreg-"));
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (p.includes("[X 등록 요약 요청]")) {
  const 답 = { summary: "노원구 소형 아파트 대출, 한도와 조건만 알면 복잡하지 않아요.", hashtags: ["노원구아파트", "대출조건"] };
  process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(답) }));
  process.exit(0);
}
process.stdout.write(JSON.stringify({ is_error: true, result: "모르는 요청" }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-xreg";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/posts.js");
const X = await import("../src/claude/x트윗요약.js");
const { buildServer } = await import("../src/web/server.js");
const { 상태적기 } = await import("../src/ai/run.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");

getDb();
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① X등록목록() — ready/published 만, draft 는 빠진다");
const 카 = C.createCategory({ name: "전세대출", requiresSearch: false, promptHint: "시험" });
const 준비됨 = P.insertDraftPost({ categoryId: 카.id, title: "준비됨", content: "본문".repeat(60), imageQuery: "q", tags: ["#가"] });
const 발행됨 = P.insertDraftPost({ categoryId: 카.id, title: "발행됨", content: "본문".repeat(60), imageQuery: "q", tags: ["#가"] });
const 초안 = P.insertDraftPost({ categoryId: 카.id, title: "아직초안", content: "본문".repeat(60), imageQuery: "q", tags: ["#가"] });
P.markReady(준비됨.id);
P.markReady(발행됨.id);
P.markPublished(발행됨.id);
const 목록 = P.X등록목록(50);
참("준비됨·발행됨은 들어간다", 목록.some((p) => p.id === 준비됨.id) && 목록.some((p) => p.id === 발행됨.id));
참("아직 draft 인 글은 안 들어간다", !목록.some((p) => p.id === 초안.id));

console.log("\n② X등록()/X등록해제() — 실제 주소를 사람이 넣고 지운다");
P.X등록(준비됨.id, "https://blog.naver.com/example/1", "naver");
const 등록후 = P.getPost(준비됨.id)!;
참("주소가 저장된다", 등록후.x_url === "https://blog.naver.com/example/1");
참("플랫폼이 저장된다", 등록후.x_platform === "naver");
참("등록 시각이 찍힌다", !!등록후.x_registered_at);
P.X등록해제(준비됨.id);
const 해제후 = P.getPost(준비됨.id)!;
참("해제하면 주소·플랫폼이 비워진다", 해제후.x_url === null && 해제후.x_platform === null);

console.log("\n③ 트윗요약받기() — 제목·본문만으로 짧은 요약 + 해시태그를 받는다, 링크는 안 넣는다");
상태적기(true, "", "claude");
const prompt = X.buildXSummaryPrompt("노원구 소형 아파트 대출", "본문 내용");
참("링크를 쓰지 말라고 지시한다", prompt.includes("링크는 쓰지 말"));
참("지어내지 말라고 지시한다", prompt.includes("지어내지"));
const 요약 = await X.트윗요약받기("노원구 소형 아파트 대출", "본문".repeat(60));
참("요약 글이 들어간다", 요약.text.includes("노원구 소형 아파트 대출"));
참("해시태그가 #과 함께 들어간다", 요약.text.includes("#노원구아파트") && 요약.text.includes("#대출조건"));
참("요약 안에는 링크가 없다(코드가 나중에 붙인다)", !요약.text.includes("http"));

console.log("\n④ API — 체험은 403, 발행 주소 등록·요약 생성/수정, AI 끊기면 409");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-xreg" };
const 체험머리 = { "x-dashboard-token": openSession({ key1: "T-1", key2: "T-1-PC", remoteToken: "r", role: "client" }) };

const 체험목록 = await app.inject({ method: "GET", url: "/api/x-posts", headers: 체험머리 });
참("체험은 목록도 403", 체험목록.statusCode === 403);

const 큐응답 = await app.inject({ method: "GET", url: "/api/x-posts", headers: 주인 });
참("주인은 200 과 목록", 큐응답.statusCode === 200 && 큐응답.json().items.some((p: any) => p.id === 발행됨.id));

const 빈주소 = await app.inject({ method: "PUT", url: `/api/posts/${발행됨.id}/x-register`, headers: 주인, payload: { url: "", platform: "naver" } });
참("빈 주소는 400", 빈주소.statusCode === 400);

const 이상한플랫폼 = await app.inject({ method: "PUT", url: `/api/posts/${발행됨.id}/x-register`, headers: 주인, payload: { url: "https://papersky.tistory.com/1", platform: "blogspot" } });
참("모르는 플랫폼은 400", 이상한플랫폼.statusCode === 400);

const 등록성공 = await app.inject({ method: "PUT", url: `/api/posts/${발행됨.id}/x-register`, headers: 주인, payload: { url: "https://papersky.tistory.com/1", platform: "tistory" } });
참("등록 성공은 200", 등록성공.statusCode === 200 && 등록성공.json().x_url === "https://papersky.tistory.com/1");

상태적기(false, "로그인이 풀렸습니다", "claude");
const 끊김응답 = await app.inject({ method: "POST", url: `/api/posts/${발행됨.id}/x-summary`, headers: 주인 });
참("AI 가 끊겨 있으면 요약 생성은 409", 끊김응답.statusCode === 409 && 끊김응답.json().needsAi === true);

상태적기(true, "", "claude");
const 요약생성 = await app.inject({ method: "POST", url: `/api/posts/${발행됨.id}/x-summary`, headers: 주인 });
참("요약 생성은 200", 요약생성.statusCode === 200 && typeof 요약생성.json().x_summary === "string" && 요약생성.json().x_summary.length > 0);

const 요약수정 = await app.inject({ method: "PUT", url: `/api/posts/${발행됨.id}/x-summary`, headers: 주인, payload: { text: "직접 고친 요약" } });
참("사람이 직접 고쳐 저장하면 그대로 저장된다", 요약수정.statusCode === 200 && 요약수정.json().x_summary === "직접 고친 요약");

const 체험등록시도 = await app.inject({ method: "PUT", url: `/api/posts/${발행됨.id}/x-register`, headers: 체험머리, payload: { url: "https://x.com", platform: "naver" } });
참("체험은 등록도 403", 체험등록시도.statusCode === 403);

await app.close();
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
