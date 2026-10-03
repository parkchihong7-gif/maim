/**
 * **[지금 모으기] 가 1~3초 만에 끝나는 길을 모두 흉내 내 시험한다** (NAVER_FAKE 없이, 진짜 코드 길로).
 *
 *     npx tsx tests/test-모으기점검.ts
 *
 * 2026-10-03 사장님 보고: 고친 뒤에도 몇 카테고리에서 1~3초 만에 끝나고 보관함이 비어 적용을 못 한다.
 * 빨리 끝나는 길은 셋이다 — ① 연관 키워드 요청 거절 ② 받았지만 거르기에서 다 빠짐 ③ 블로그 검색이 계속 실패.
 * 각 길에서 «고쳐서 모으거나» «까닭을 그대로 보여 주는지» 를 본다. 🩺 점검 API 도 본다.
 */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-chk-"));
process.env.DATA_DIR = 임시; process.env.NAVER_GAP_MS = "0";
process.env.DASHBOARD_TOKEN = "owner-test-token-chk";
delete process.env.NAVER_FAKE; delete process.env.KEYSERVER_URL;
process.env.NAVER_SEARCH_CLIENT_ID = "hubclientid0123456789"; process.env.NAVER_SEARCH_CLIENT_SECRET = "hubsecret12";
process.env.NAVER_AD_API_KEY = "0100000000aaaaaaaaaaaaaaaa"; process.env.NAVER_AD_SECRET = "AQAAAAAbbbbbbbbbbbbbbbbbbbb"; process.env.NAVER_AD_CUSTOMER_ID = "1234567";

let 틀린것 = 0;
function 참(말: string, 값: boolean) { if (값) console.log(`   ✅ ${말}`); else { console.log(`   ❌ ${말}`); 틀린것 += 1; } }

type 방식 = { 검색량: number; 개수: number; 여럿코드: number; 기호거절: boolean; 블로그코드: number };
let 지금: 방식 = { 검색량: 2000, 개수: 60, 여럿코드: 200, 기호거절: true, 블로그코드: 200 };
const 받은씨앗: string[] = [];
const 진짜fetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.startsWith("http://localhost") || u.startsWith("http://127.")) return 진짜fetch(url, init);
  if (u.includes("keywordstool")) {
    const 씨앗들 = u.split("hintKeywords=")[1].split("&")[0].split(",").map(decodeURIComponent);
    받은씨앗.push(...씨앗들);
    if (지금.기호거절 && 씨앗들.some((s) => /[^가-힣A-Za-z0-9]/.test(s))) return new Response(JSON.stringify({ code: 11001, title: "잘못된 파라미터 형식입니다." }), { status: 400 });
    if (씨앗들.length > 1 && 지금.여럿코드 !== 200) return new Response("{}", { status: 지금.여럿코드 });
    return new Response(JSON.stringify({ keywordList: 씨앗들.flatMap((s) => Array.from({ length: 지금.개수 }, (_, i) => ({
      relKeyword: `${s}관련${i}`, monthlyPcQcCnt: Math.round(지금.검색량 / 4), monthlyMobileQcCnt: Math.round(지금.검색량 * 3 / 4), compIdx: "낮음" }))) }), { status: 200 });
  }
  if (u.includes("search/v1/blog") || u.includes("blog.json")) {
    return 지금.블로그코드 === 200
      ? new Response(JSON.stringify({ total: 300, items: [{ title: "상위 글", description: "", postdate: "20261001" }] }), { status: 200 })
      : new Response(JSON.stringify({ errorMessage: "Authentication failed" }), { status: 지금.블로그코드 });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const { getDb } = await import("../src/db/index.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/keywordPool.js");
const Posts = await import("../src/db/repositories/posts.js");
const M = await import("../src/naver/키워드모으기.js");
const A = await import("../src/naver/검색광고.js");
const { buildServer } = await import("../src/web/server.js");
getDb();

console.log("\n① 씨앗의 기호 — 네이버가 400(11001)으로 거절하던 것");
참("기호·띄어쓰기 빼기", JSON.stringify(A.씨앗다듬기(["AI·로봇 (뉴스)", "2026/10 정책자금!", "  ", "AI로봇뉴스"])) === JSON.stringify(["AI로봇뉴스", "202610정책자금"]));
const 기호 = C.createCategory({ name: "AI·로봇 (뉴스)", requiresSearch: true, promptHint: "x", mustKeywords: "정책/자금" });
const r1 = await M.키워드모으기(기호.id);
참(`기호 섞인 카테고리도 끝까지 (${r1.state}, ${r1.kept}개)`, r1.state === "done" && r1.kept > 0 && !받은씨앗.some((s) => /[^가-힣A-Za-z0-9]/.test(s)));

console.log("\n② 씨앗 여럿을 400 말고 다른 코드(500)로 거절해도 하나씩 물어 합친다");
지금 = { ...지금, 여럿코드: 500 };
const 여럿 = C.createCategory({ name: "부동산 뉴스", requiresSearch: true, promptHint: "x", mustKeywords: "전세, 청약" });
const r2 = await M.키워드모으기(여럿.id);
참(`하나씩 물어 끝까지 (${r2.state}, 받음 ${r2.received})`, r2.state === "done" && r2.received === 180);
지금 = { ...지금, 여럿코드: 200 };

console.log("\n③ 받았지만 다 걸러질 때");
지금 = { ...지금, 검색량: 50 };
const 좁음 = C.createCategory({ name: "작은 동네 소식", requiresSearch: true, promptHint: "x" });
const r3 = await M.키워드모으기(좁음.id);
참(`검색량 100 미만뿐이면 기준을 10 으로 낮춰 다시 고른다 (${r3.state}, ${r3.kept}개)`, r3.state === "done" && r3.kept > 0 && r3.dropped!.relaxed === true);
지금 = { ...지금, 검색량: 4 };
const 아주 = C.createCategory({ name: "아주 작은 소식", requiresSearch: true, promptHint: "x" });
const t3 = Date.now();
const r4 = await M.키워드모으기(아주.id);
참(`그래도 0개면 까닭을 숫자로 (${r4.message.slice(0, 50)}…)`, r4.state === "error" && r4.message.includes("모두 걸러졌습니다") && r4.message.includes("검색량 부족 60") && Date.now() - t3 < 3000);
참("마지막 결과를 표에 남긴다", JSON.parse(C.getCategory(아주.id)!.kw_last!).message === r4.message);
지금 = { ...지금, 검색량: 2000 };
const 씀 = C.createCategory({ name: "매일 쓰는 주제", requiresSearch: true, promptHint: "x" });
for (let i = 0; i < 60; i++) {
  const p = Posts.insertDraftPost({ categoryId: 씀.id, title: `매일쓰는주제관련${i} 정리`, content: "본문", imageQuery: "x", tags: ["#가"] });
  Posts.markReady(p.id);
}
const r5 = await M.키워드모으기(씀.id);
참(`연관어가 모두 지난 제목에 있어도 느슨하게 다시 골라 모은다 (${r5.state}, ${r5.kept}개)`, r5.state === "done" && r5.kept > 0 && r5.dropped!.relaxed === true);
지금 = { ...지금, 개수: 0 };
const 빈 = C.createCategory({ name: "빈 답", requiresSearch: true, promptHint: "x" });
const r6 = await M.키워드모으기(빈.id);
참("연관 키워드 0개면 그렇다고 + 씨앗을 보여 준다", r6.state === "error" && r6.message.includes("0개") && r6.message.includes("빈답"));
지금 = { ...지금, 개수: 60 };

console.log("\n④ 블로그 검색이 계속 실패할 때 — 50개를 «미확인» 으로 채우지 말고 바로 알린다");
지금 = { ...지금, 블로그코드: 401 };
const 블 = C.createCategory({ name: "블로그 키 오류", requiresSearch: true, promptHint: "x" });
const r7 = await M.키워드모으기(블.id);
참(`세 번 실패하면 멈추고 까닭 (${r7.message.slice(0, 40)}…)`, r7.state === "error" && r7.message.includes("블로그 검색 API 가 답하지 않습니다") && r7.checked === 0);
참("받은 연관 키워드는 남겨 둔다(이어서 모으기)", !!C.getCategory(블.id)!.kw_job && P.보관함목록(블.id).length === 0);
지금 = { ...지금, 블로그코드: 200 };
const r8 = await M.키워드모으기(블.id, { 이어서: true });
참(`키를 고친 뒤 이어서 모으면 끝까지 (${r8.state}, ${r8.kept}개)`, r8.state === "done" && r8.kept > 0);

console.log("\n⑤ 🩺 점검 API · 화면 목록의 마지막 결과");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-chk" };
지금 = { ...지금, 여럿코드: 500 };
const 점검 = (await app.inject({ method: "GET", url: `/api/keywords/${여럿.id}/check`, headers: 주인 })).json();
참("씨앗·한꺼번에(하나씩 물어 합침)·하나씩·블로그 검색을 보여 준다", 점검.seeds.length === 3 && 점검.together.ok === true && 점검.together.rows === 180 && 점검.each.every((e: any) => e.ok && e.rows === 60) && 점검.blog.ok === true);
const 목록 = (await app.inject({ method: "GET", url: "/api/keywords", headers: 주인 })).json();
참("탭 목록에 카테고리마다 마지막 결과", 목록.categories.find((c: any) => c.id === 아주.id).last.state === "error");
참("체험 키는 점검 403", (await app.inject({ method: "GET", url: `/api/keywords/${여럿.id}/check`, headers: { "x-dashboard-token": "nope" } })).statusCode !== 200);
await app.close();

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
