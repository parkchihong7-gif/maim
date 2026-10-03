/**
 * **진단 반영 · 변주** 를 시험한다.
 *
 *     npx tsx tests/test-변주진단.ts
 *
 * - ③ 블로그 진단에서 체크한 개선점이 (④ 적용 켰을 때) 글쓰기 지시문에 들어가는가
 * - 글마다 도입·소제목·목록·마무리가 최근 글과 겹치지 않게 바뀌고, 최근 첫 문장·마무리·반복 표현을 피하라고 하는가
 * 인터넷도 진짜 AI 도 필요 없다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-var-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (!p.includes("자료만 빠르게")) fs.writeFileSync(${JSON.stringify(기록)}, p);
if (p.includes("[스타일 분석 요청]")) {
  process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify({
    style: { tone: "친근한 말투" }, strengths: ["a"], priority: ["출처 한 줄"],
    improvements: [{ title: "마무리가 늘 같다", why: "반복", how: "마무리 방식을 바꾸기" },
                   { title: "제목이 비슷하다", why: "겹침", how: "대상을 앞에" },
                   { title: "본문이 짧다", why: "이탈", how: "예외 문단 추가" }] }) }));
  process.exit(0);
}
const n = Date.now() % 100000;
const 글 = { keyword: "시험 키워드 조합", title: "시험 키워드 조합 알아 두면 손해 안 보는 3가지 기준",
  content: "첫 줄 " + n + " 입니다.\\n" + "오늘은 꼭 알아 두면 좋은 정보를 정리해 볼게요. ".repeat(80) + "\\n끝 문장 " + n + " 이에요.",
  image_query: "test", tags: ["#가","#나","#다","#라","#마"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-var";
process.env.NAVER_FAKE = "1";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const S = await import("../src/db/repositories/settings.js");
const C = await import("../src/db/repositories/categories.js");
const V = await import("../src/pipeline/변주.js");
const A = await import("../src/claude/스타일분석.js");
const { generatePost } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
const { buildServer } = await import("../src/web/server.js");
const { 상태적기 } = await import("../src/ai/run.js");

getDb();
S.최소분량정하기(1000);
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 지시문 = () => fs.readFileSync(기록, "utf8");

console.log("\n① 변주 고르기 규칙");
참("최근에 쓴 것은 피한다", Array.from({ length: 30 }, () => V.덜쓴것(["a", "b", "c"], ["a", "b"])).every((x) => x === "c"));
참("바로 앞 글에 쓴 것은 더 무겁게 — 두 번 쓴 옛것보다 피한다", V.덜쓴것(["a", "b"], ["a", "x", "x", "b", "b"]) === "b");
참("여러 글에 되풀이된 세 낱말 묶음", JSON.stringify(V.반복표현(["정리해 볼게요 오늘은 알아 둘 것", "정리해 볼게요 오늘은 다른 것", "정리해 볼게요 오늘은 또"], 3)) === JSON.stringify(["정리해 볼게요 오늘은"]));
const 인사 = Array.from({ length: 400 }, () => assignDirectives(1)[0].openingStyle).filter((x) => x === "greeting").length;
참(`[지금 생성] 이 늘 인사말로 시작하지 않는다 (400번 중 ${인사}번)`, 인사 > 40 && 인사 < 160);
const 단계 = V.변주고르기(assignDirectives(1)[0], { 첫문장: [], 마무리: [], 반복: [], 기록: [{ heading: "question" }, { heading: "noun" }, { heading: "verdict" }, { heading: "talk" }] });
참("단계형 소제목이면 숫자 이모지", 단계.변주.heading === "step" && 단계.변주.emoji === "num");
const 구간블록 = V.변주블록(단계.변주, { 첫문장: ["첫"], 마무리: ["끝"], 반복: ["되풀이 말 셋"], 기록: [] }, { 구간: { n: 0, 수: 4 } });
참("구간용: 첫 구간엔 첫 문장 피하기만, 마무리는 없다", 구간블록.includes("«첫»") && !구간블록.includes("«끝»") && !구간블록.includes("소제목:"));

console.log("\n② 글을 이어 쓰면 — 변주가 바뀌고 최근 것을 피하라고 한다");
상태적기(true, "", "claude");
const 카 = C.createCategory({ name: "시험", requiresSearch: false, promptHint: "시험" });
const 글들 = [];
for (let i = 0; i < 4; i++) {
  const 기록1 = {} as any;
  글들.push(await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0], 기록1));
  if (i === 0) 참(`생성 기록에 변주 한 줄 (${기록1.변주})`, typeof 기록1.변주 === "string" && 기록1.변주.split("·").length === 7);
}
const 변주들 = 글들.map((p) => JSON.parse((getDb().prepare("SELECT variation_json FROM posts WHERE id = ?").get(p.id) as any).variation_json));
참("글마다 변주를 남긴다", 변주들.every((v) => v.opening && v.heading && v.closing));
참("이어진 두 글의 도입·소제목·마무리가 겹치지 않는다", 변주들.slice(1).every((v, i) => v.opening !== 변주들[i].opening && v.heading !== 변주들[i].heading && v.closing !== 변주들[i].closing));
const 넷째 = 지시문();
참("지시문에 [변주] 블록", 넷째.includes("[변주 — 이 블로그의 최근 글과 다르게"));
참("최근 첫 문장·마지막 문장을 피하라고", 넷째.includes("최근 글의 첫 문장") && 넷째.includes("첫 줄") && 넷째.includes("최근 글의 마지막 문장"));
참("여러 글에 되풀이된 표현을 쓰지 말라고", 넷째.includes("되풀이된 표현") && 넷째.includes("정리해 볼게요"));
참("도입 지시도 고른 변주대로", 넷째.includes("1. 도입부 규칙"));

console.log("\n③ 블로그 진단 — 체크한 개선점만 글쓰기에");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-var" };
const 분석 = (await app.inject({ method: "POST", url: "/api/style/analyze", headers: 주인, payload: { url: "myblog" } })).json();
참("개선점은 처음엔 모두 «반영»", 분석.analysis.improvements.every((x: any) => x.use === true));
await app.inject({ method: "PUT", url: `/api/style/${분석.id}/approve`, headers: 주인, payload: { analysis: 분석.analysis, confirmed: true } });
await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
참("④ 적용 전에는 진단이 들어가지 않는다", !지시문().includes("[내 블로그 진단"));
await app.inject({ method: "PUT", url: "/api/style/apply", headers: 주인, payload: { on: true } });
const 끔 = (await app.inject({ method: "PUT", url: `/api/style/${분석.id}/uses`, headers: 주인, payload: { uses: [true, false, true] } })).json();
참("체크를 끄면 바로 저장, 승인은 그대로", 끔.analysis.improvements[1].use === false && !!끔.approvedAt);
await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
const 진단지시 = 지시문();
참("적용하면 체크한 개선점(무엇 → 어떻게)이 들어간다", 진단지시.includes("[내 블로그 진단") && 진단지시.includes("마무리가 늘 같다 → 마무리 방식을 바꾸기") && 진단지시.includes("본문이 짧다"));
참("끈 개선점은 빠진다", !진단지시.includes("제목이 비슷하다"));
참("«먼저 할 것» 도 들어간다", 진단지시.includes("먼저 할 것: 출처 한 줄"));
참("경험은 지어내지 말라는 줄", 진단지시.includes("지어내지 마라)"));
참("진단 블록은 900자 이내", A.진단블록({ improvements: Array.from({ length: 6 }, (_, i) => ({ title: "가".repeat(120), why: "", how: "나".repeat(300), use: true })), priority: [] }).length <= 900);
참("잘못된 uses 는 400", (await app.inject({ method: "PUT", url: `/api/style/${분석.id}/uses`, headers: 주인, payload: { uses: "x" } })).statusCode === 400);
await app.close();

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
