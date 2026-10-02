/**
 * **🔎 네이버 키워드 — 모으기·보관함·포스팅 적용을 시험한다.**
 *
 *     npx tsx tests/test-키워드보관함.ts
 *
 * 인터넷이 필요 없다. 네이버는 `tools/fake-naver.json`(NAVER_FAKE=1), AI 는
 * «받은 지시문을 파일에 적고 정해진 글을 돌려주는» 가짜를 쓴다.
 *
 * 가장 중요한 것: **[포스팅에 적용] 을 끈 카테고리는 예전과 똑같이 쓴다.**
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-kwpool-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
// 조사 단계 지시문은 따로 둔다 — 마지막에 남는 것이 글쓰기 지시문이어야 한다.
if (!p.includes("자료만 빠르게")) fs.writeFileSync(${JSON.stringify(기록)}, p);
const 본문 = "가짜 본문입니다. ".repeat(120);
const 글 = { keyword: "시험 키워드 조합", title: "시험 키워드 조합 알아 두면 손해 안 보는 3가지 기준",
  content: 본문, image_query: "test", tags: ["#가","#나","#다","#라","#마"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.NAVER_FAKE = "1";
process.env.NAVER_GAP_MS = "0";
process.env.DASHBOARD_TOKEN = "owner-test-token-kw";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const S = await import("../src/db/repositories/settings.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/keywordPool.js");
const 모으기 = await import("../src/naver/키워드모으기.js");
const { generatePost, 빈기록 } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");
const { buildServer } = await import("../src/web/server.js");

getDb();
S.최소분량정하기(800);

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 지시문 = () => fs.readFileSync(기록, "utf8");
const 상태 = (catId: number, 말: string) => P.보관함목록(catId).find((r) => r.keyword === 말)?.status;

const 부동산 = C.createCategory({ name: "부동산 정보", requiresSearch: false, promptHint: "전세·매매 정보", mustKeywords: "전세 계약" });

console.log("\n① 모으기 — 연관 키워드 → 문서 수 → 등급 → 보관함");
const 결과 = await 모으기.키워드모으기(부동산.id);
참(`끝까지 돌았다 (${결과.state}: ${결과.message})`, 결과.state === "done");
참("씨앗 = 카테고리 이름 + 함께 들어갈 말", JSON.stringify(모으기.씨앗뽑기(부동산)) === JSON.stringify(["부동산 정보", "전세 계약"]));
참(`연관 키워드 ${결과.received}개 받음`, 결과.received === 9);
참("검색량 100 미만(전세확정일자 45)은 뺐다", !P.보관함목록(부동산.id).some((r) => r.keyword === "전세확정일자"));
참(`보관함에 ${결과.kept}개`, 결과.kept === 8);
const 개수 = P.보관함개수(부동산.id);
참(`골드 2 · 실버 3 · 브론즈 1 · 그 외 1 · 미확인 1 (${JSON.stringify(개수)})`,
  개수.gold === 2 && 개수.silver === 3 && 개수.bronze === 1 && 개수.etc === 1 && 개수.unknown === 1);
참("문서 수를 못 받은 것은 미확인(0 이 아님)",
  P.보관함목록(부동산.id).find((r) => r.keyword === "전세계약갱신청구권행사")?.doc_total === null);
참("다음에 쓸 것 = 골드 중 검색량 많은 «전세계약특약»", P.다음키워드(부동산.id)?.keyword === "전세계약특약");
const 다시본 = C.getCategory(부동산.id)!;
참("다 모은 날이 적혔고, 멈춘 자리는 비었다", !!다시본.kw_refreshed_at && !다시본.kw_job);

console.log("\n② [포스팅에 적용] 을 끈 카테고리 — 예전과 똑같다");
const 기록끔 = 빈기록();
await generatePost(C.getCategory(부동산.id)!, assignDirectives(1)[0], 기록끔);
참("지시문에 [키워드 데이터] 가 없다", !지시문().includes("[키워드 데이터"));
참("키워드 출처 = AI", 기록끔.키워드출처 === "AI");
참("보관함은 그대로 (특약은 아직 대기)", 상태(부동산.id, "전세계약특약") === "candidate");

console.log("\n③ 켠 카테고리 — 주제 키워드가 비면 보관함 1순위로 쓴다");
C.키워드칸적기(부동산.id, { kw_apply: 1 });
const 기록켬 = 빈기록();
await generatePost(C.getCategory(부동산.id)!, assignDirectives(1)[0], 기록켬);
const 켬지시 = 지시문();
참("지시문의 주제 키워드 = «전세계약특약»", 켬지시.includes('[최우선 지시 — 이번 글의 주제 키워드] "전세계약특약"'));
참("[키워드 데이터] 블록이 들어갔다", 켬지시.includes("[키워드 데이터"));
참("상위 글은 «베끼지 말고» 라고 적혀 있다", 켬지시.includes("베끼지 말고"));
참("키워드 출처 = 보관함", 기록켬.키워드출처 === "보관함" && 기록켬.보관키워드 === "전세계약특약");
참("쓴 키워드는 «씀» 이 됐다", 상태(부동산.id, "전세계약특약") === "used");
참("카테고리의 주제 키워드 칸은 그대로 비어 있다", !C.getCategory(부동산.id)!.topic_keyword);
참("다음은 «전세확정일자효력»", P.다음키워드(부동산.id)?.keyword === "전세확정일자효력");

console.log("\n④ 주제 키워드를 직접 적었으면 그것이 먼저");
C.updateCategory(부동산.id, { topicKeyword: "직접 적은 말" });
const 기록직접 = 빈기록();
await generatePost(C.getCategory(부동산.id)!, assignDirectives(1)[0], 기록직접);
참("지시문의 주제 키워드 = «직접 적은 말»", 지시문().includes('"직접 적은 말"') && !지시문().includes("[키워드 데이터"));
참("키워드 출처 = 직접, 보관함은 안 줄었다", 기록직접.키워드출처 === "직접" && 상태(부동산.id, "전세확정일자효력") === "candidate");
C.updateCategory(부동산.id, { topicKeyword: null });

console.log("\n⑤ 보관함이 바닥나면 예전 방식으로 — 글은 멈추지 않는다");
for (const r of P.보관함목록(부동산.id)) if (r.status === "candidate") P.키워드상태(r.id, "hold");
const 기록바닥 = 빈기록();
const 바닥글 = await generatePost(C.getCategory(부동산.id)!, assignDirectives(1)[0], 기록바닥);
참("글이 나왔다", !!바닥글.id);
참("키워드 출처 = AI", 기록바닥.키워드출처 === "AI" && !지시문().includes("[키워드 데이터"));

console.log("\n⑥ 다시 모아도 «씀»·«보류» 는 그대로");
const 다시 = await 모으기.키워드모으기(부동산.id);
참(`이미 쓴·보류한 키워드는 뺐다 (${다시.excludedUsed}개)`, 다시.excludedUsed >= 1);
참("특약은 여전히 «씀»", 상태(부동산.id, "전세계약특약") === "used");
참("보류해 둔 효력은 여전히 «보류»", 상태(부동산.id, "전세확정일자효력") === "hold");

console.log("\n⑦ [중지] → 모은 것은 남고 [이어서 모으기] 로 남은 것만");
const 전세 = C.createCategory({ name: "전세 정보", requiresSearch: false, promptHint: "전세" });
const 도는것 = 모으기.키워드모으기(전세.id);   // 첫 await 전에 «돌고 있음» 이 적힌다
참("돌고 있을 때 [중지] 가 먹는다", 모으기.모으기멈추기(전세.id));
const 멈춤 = await 도는것;
참(`멈췄다 (${멈춤.state})`, 멈춤.state === "stopped");
참("멈춘 자리를 적어 두었다", !!C.getCategory(전세.id)!.kw_job);
const 이어 = await 모으기.키워드모으기(전세.id, { 이어서: true });
참(`이어서 끝냈다 (${이어.state}, ${이어.kept}개)`, 이어.state === "done" && 이어.kept === 8);
참("이어서 할 때 연관 키워드를 다시 받지 않았다(받은 수는 처음 것)", 이어.received === 9 && !C.getCategory(전세.id)!.kw_job);

console.log("\n⑧ 화면 API — 주인만, 체험은 403");
const app = await buildServer();
const 주인머리 = { "x-dashboard-token": "owner-test-token-kw" };
const 체험머리 = { "x-dashboard-token": openSession({ key1: "T-1", key2: "T-1-PC", remoteToken: "r", role: "client" }) };
const 목록 = await app.inject({ method: "GET", url: "/api/keywords", headers: 주인머리 });
const 목록답 = 목록.json();
참("주인: 카테고리마다 개수가 온다", 목록.statusCode === 200 && 목록답.categories.find((c: any) => c.id === 전세.id)?.counts.gold === 2);
참("체험: 키워드 탭은 403", (await app.inject({ method: "GET", url: "/api/keywords", headers: 체험머리 })).statusCode === 403);
참("체험: 모으기도 403", (await app.inject({ method: "POST", url: `/api/keywords/${전세.id}/collect`, headers: 체험머리, payload: {} })).statusCode === 403);
const 빈카 = C.createCategory({ name: "빈 카테고리", requiresSearch: false, promptHint: "빈" });
참("쓸 키워드가 없으면 [적용] 을 켜지 않는다 (400)",
  (await app.inject({ method: "PUT", url: `/api/keywords/${빈카.id}/apply`, headers: 주인머리, payload: { on: true } })).statusCode === 400);
참("모은 카테고리는 켜진다",
  (await app.inject({ method: "PUT", url: `/api/keywords/${전세.id}/apply`, headers: 주인머리, payload: { on: true } })).json().apply === true);
const 한줄 = P.보관함목록(전세.id).find((r) => r.status === "candidate")!;
참("[보류] 가 먹는다",
  (await app.inject({ method: "PUT", url: `/api/keywords/item/${한줄.id}`, headers: 주인머리, payload: { status: "hold" } })).statusCode === 200
  && 상태(전세.id, 한줄.keyword) === "hold");
await app.close();

console.log("\n⑨ 카테고리를 지우면 그 보관함도 같이 지워진다");
C.deleteCategory(전세.id);
참("보관함 줄이 남지 않았다", P.보관함목록(전세.id).length === 0);

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
