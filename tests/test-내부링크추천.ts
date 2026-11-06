/**
 * **내부링크(관련 글) 추천** 을 시험한다 — 같은 카테고리의 완성된 글 제목을
 * "함께 보면 좋은 글"로 골라 주는 기능(구글이 보는 내부링크 신뢰 신호).
 *
 *     npx tsx tests/test-내부링크추천.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-related-"));
process.env.DATA_DIR = 임시;
process.env.DASHBOARD_TOKEN = "owner-test-token-rel";
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

console.log("\n① 관련글() — 같은 카테고리의 완성된 글만, 자기 자신은 빼고, 최근 것부터");
const 카1 = C.createCategory({ name: "전세대출", requiresSearch: false, promptHint: "시험" });
const 카2 = C.createCategory({ name: "다른카테고리", requiresSearch: false, promptHint: "시험" });
const 글A = P.insertDraftPost({ categoryId: 카1.id, title: "글A", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
const 글B = P.insertDraftPost({ categoryId: 카1.id, title: "글B", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
const 글C초안 = P.insertDraftPost({ categoryId: 카1.id, title: "글C(초안,아직 draft)", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
const 글D다른카 = P.insertDraftPost({ categoryId: 카2.id, title: "글D(다른 카테고리)", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
P.markReady(글A.id);
P.markReady(글B.id);
P.markPublished(글A.id);
// 글C초안·글D다른카는 ready/published 로 안 만든다 — 각각 "아직 완성 안 됨"·"다른 카테고리" 시험용.

const 최신글 = P.insertDraftPost({ categoryId: 카1.id, title: "최신글(지금 막 생성됨)", content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
const 추천 = P.관련글(카1.id, 최신글.id, 3);
참("같은 카테고리의 완성된 글 둘(글A·글B)이 나온다", 추천.length === 2 && 추천.some((r) => r.title === "글A") && 추천.some((r) => r.title === "글B"));
참("아직 draft 인 글C는 안 나온다", !추천.some((r) => r.title.includes("글C")));
참("다른 카테고리 글D는 안 나온다", !추천.some((r) => r.title.includes("글D")));
참("자기 자신(최신글)은 안 나온다", !추천.some((r) => r.id === 최신글.id));

console.log("\n② limit — 완성된 글이 limit 보다 많으면 최근 것부터 그만큼만");
for (let i = 0; i < 4; i++) {
  const g = P.insertDraftPost({ categoryId: 카1.id, title: `추가글${i}`, content: "본문".repeat(50), imageQuery: "q", tags: ["#가"] });
  P.markReady(g.id);
}
const 둘만 = P.관련글(카1.id, 최신글.id, 2);
참("limit=2 면 2개만 온다", 둘만.length === 2);
참("가장 최근 것부터(추가글3·추가글2)", 둘만[0].title === "추가글3" && 둘만[1].title === "추가글2");

console.log("\n③ /api/queue 응답에 related 가 같이 온다");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-rel" };
const 큐응답 = (await app.inject({ method: "GET", url: "/api/queue", headers: 주인 })).json();
const 최신글항목 = 큐응답.items.find((p: any) => p.id === 최신글.id);
참("큐 항목에 related 배열이 있다", Array.isArray(최신글항목.related));
참("related 에 제목이 들어 있다(글A 또는 추가글3 등)", 최신글항목.related.length > 0 && typeof 최신글항목.related[0].title === "string");

await app.close();
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
