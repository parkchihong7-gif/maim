/**
 * **실제 네이버 응답을 흉내 내 [지금 모으기] 를 시험한다** (NAVER_FAKE 없이, 진짜 코드 길로).
 *
 *     npx tsx tests/test-모으기실제흉내.ts
 *
 * 2026-10-02 사장님 보고: 연결 테스트는 ✅ 인데 [지금 모으기] 가 3초 만에 끝났다.
 * 원인: 씨앗 여럿을 이을 때 쉼표까지 %2C 로 인코딩 → 네이버가 400. 연결 테스트는
 * 씨앗 1개라 쉼표가 없어 통과했다. 이 시험이 그 길을 막는다.
 */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-sim-"));
process.env.DATA_DIR = 임시; process.env.NAVER_GAP_MS = "0";
delete process.env.NAVER_FAKE;
process.env.NAVER_SEARCH_CLIENT_ID = "hubclientid0123456789"; process.env.NAVER_SEARCH_CLIENT_SECRET = "hubsecret12";
process.env.NAVER_AD_API_KEY = "0100000000aaaaaaaaaaaaaaaa"; process.env.NAVER_AD_SECRET = "AQAAAAAbbbbbbbbbbbbbbbbbbbb"; process.env.NAVER_AD_CUSTOMER_ID = "1234567";

let 틀린것 = 0;
function 참(말: string, 값: boolean) { if (값) console.log(`   ✅ ${말}`); else { console.log(`   ❌ ${말}`); 틀린것 += 1; } }

type 방식 = { 쉼표거절: boolean; 여럿거절: boolean; 블로그코드: number };
let 지금: 방식 = { 쉼표거절: true, 여럿거절: false, 블로그코드: 200 };
const 부른: string[] = [];
const 목록 = (씨앗: string) => Array.from({ length: 120 }, (_, i) => ({
  relKeyword: `${씨앗}관련${i}`, monthlyPcQcCnt: i % 4 === 0 ? "< 10" : 300 + i * 7, monthlyMobileQcCnt: 900 + i * 13,
  compIdx: ["낮음", "중간", "높음"][i % 3],
}));
globalThis.fetch = (async (url: any) => {
  const u = String(url); 부른.push(u);
  if (u.includes("keywordstool")) {
    const raw = u.split("hintKeywords=")[1].split("&")[0];
    if (지금.쉼표거절 && raw.includes("%2C")) return new Response(JSON.stringify({ code: 11001, title: "잘못된 파라미터 형식입니다." }), { status: 400 });
    if (지금.여럿거절 && raw.includes(",")) return new Response(JSON.stringify({ code: 11001, title: "잘못된 파라미터 형식입니다." }), { status: 400 });
    const 씨앗들 = raw.split(",").map(decodeURIComponent);
    return new Response(JSON.stringify({ keywordList: 씨앗들.flatMap(목록) }), { status: 200 });
  }
  if (u.includes("search/v1/blog") || u.includes("blog.json")) {
    return 지금.블로그코드 === 200
      ? new Response(JSON.stringify({ total: 800, items: [{ title: "<b>상위</b> 글", description: "", postdate: "20261001" }] }), { status: 200 })
      : new Response("{}", { status: 지금.블로그코드 });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const { getDb } = await import("../src/db/index.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/keywordPool.js");
const M = await import("../src/naver/키워드모으기.js");
const 블검 = await import("../src/naver/블로그검색.js");
getDb();

console.log("\n① 씨앗 여럿 — 쉼표를 %2C 로 보내면 거절하는 네이버");
const 가 = C.createCategory({ name: "종합 뉴스", requiresSearch: true, promptHint: "뉴스", mustKeywords: "부동산, 경제" });
const t0 = Date.now();
const r1 = await M.키워드모으기(가.id);
const 첫 = 부른.find((u) => u.includes("keywordstool")) ?? "";
참(`끝까지 돌았다 (${r1.state}: ${r1.message})`, r1.state === "done");
참("쉼표는 그대로, 씨앗만 인코딩해 보냈다", 첫.includes(",") && !첫.includes("%2C"));
참(`연관 키워드 ${r1.received}개 받음 (씨앗 3개 × 120)`, r1.received === 360);
참(`문서 수 확인 ${r1.checked}/${r1.toCheck} — 50개까지`, r1.checked === 50 && r1.toCheck === 50);
참(`보관함 ${r1.kept}개`, r1.kept === 30 && P.보관함목록(가.id).length === 30);
참(`빨리 끝났지만 일은 다 했다 (${Date.now() - t0}ms, 시험이라 네이버 지연 없음)`, true);

console.log("\n② 씨앗 여럿을 아예 못 받아 주는 경우 — 하나씩 묻고 합친다");
지금 = { 쉼표거절: true, 여럿거절: true, 블로그코드: 200 };
부른.length = 0;
const 나 = C.createCategory({ name: "부동산 정보", requiresSearch: true, promptHint: "부동산", mustKeywords: "전세, 청약" });
const r2 = await M.키워드모으기(나.id);
참(`끝까지 돌았다 (${r2.state})`, r2.state === "done");
참("검색광고를 4번 불렀다 (한꺼번에 1 + 하나씩 3)", 부른.filter((u) => u.includes("keywordstool")).length === 4);
참(`합친 연관 키워드 ${r2.received}개`, r2.received === 360);

// 10-03 바뀜: 예전엔 끝까지 돌며 50개를 «미확인» 으로 채웠다 — 그러면 보관함에 쓸 키워드가 0개라 [포스팅에 적용] 을 못 켠다.
// 이제는 세 번 연속 실패하면 바로 멈추고 까닭을 알린다(받은 연관 키워드는 남겨 [이어서 모으기]).
console.log("\n③ 블로그 검색 키가 틀린 경우 — 바로 멈추고 까닭을 알린다");
지금 = { 쉼표거절: true, 여럿거절: false, 블로그코드: 401 };
블검.창구기억지우기();
const 다 = C.createCategory({ name: "생활 꿀팁", requiresSearch: true, promptHint: "생활" });
const r3 = await M.키워드모으기(다.id);
참(`멈추고 까닭 (${r3.state}: ${r3.message.slice(0, 30)}…)`, r3.state === "error" && r3.message.includes("블로그 검색 API 가 답하지 않습니다"));
참("«미확인» 으로 채우지 않고 이어서 할 자리를 남긴다", P.보관함개수(다.id).unknown === 0 && !!C.getCategory(다.id)!.kw_job);

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
