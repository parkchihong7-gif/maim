/**
 * **발행 완료 표시 복원** 을 시험한다 — 잘못 눌러 «발행 완료» 로 표시된 글을 초안으로 되돌리는 기능.
 *
 *     npx tsx tests/test-발행복원.ts
 *
 * 인터넷도 AI 도 필요 없다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-unpub-"));
process.env.DATA_DIR = 임시;
process.env.DASHBOARD_TOKEN = "owner-test-token-unpub";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/posts.js");
const { buildServer } = await import("../src/web/server.js");

getDb();
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-unpub" };
const 카 = C.createCategory({ name: "시험", requiresSearch: false, promptHint: "시험" });

console.log("\n① 발행 완료로 표시 → 복원하면 초안 준비 완료로 돌아간다");
const post = P.insertDraftPost({ categoryId: 카.id, title: "제목", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
P.markReady(post.id);
await app.inject({ method: "POST", url: `/api/posts/${post.id}/mark-published`, headers: 주인 });
const 발행후 = P.getPost(post.id)!;
참("상태가 published, 발행 시각이 있다", 발행후.status === "published" && !!발행후.published_at);

const 복원응답 = (await app.inject({ method: "POST", url: `/api/posts/${post.id}/unpublish`, headers: 주인 })).json();
참("복원 응답 상태가 ready", 복원응답.status === "ready");
참("복원 응답에 발행 시각이 없다", 복원응답.published_at === null);
const 복원후 = P.getPost(post.id)!;
참("DB 에도 ready 로, 발행 시각은 지워졌다", 복원후.status === "ready" && 복원후.published_at === null);
참("글 내용은 그대로(제목·본문 안 건드림)", 복원후.title === "제목" && 복원후.content === 발행후.content);

console.log("\n② 발행 완료가 아닌 글을 복원하려 하면 400");
const 초안 = P.insertDraftPost({ categoryId: 카.id, title: "초안", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
const 실패 = await app.inject({ method: "POST", url: `/api/posts/${초안.id}/unpublish`, headers: 주인 });
참("400 — 발행 완료로 표시된 글이 아니다", 실패.statusCode === 400 && 실패.json().error.includes("발행 완료"));

console.log("\n③ 없는 글은 404");
const 없음 = await app.inject({ method: "POST", url: "/api/posts/999999/unpublish", headers: 주인 });
참("404", 없음.statusCode === 404);

await app.close();
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
