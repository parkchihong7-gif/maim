/**
 * **C. 🎨 내 블로그 분석(스타일·진단·승인·적용)** 을 시험한다.
 *
 *     npx tsx tests/test-스타일분석.ts
 *
 * 인터넷도 진짜 AI 도 필요 없다. 블로그 글은 tools/fake-naver.json 의 myblog,
 * AI 는 받은 지시문을 파일에 적고 정해진 답을 주는 가짜다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-st-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (!p.includes("자료만 빠르게")) fs.writeFileSync(${JSON.stringify(기록)}, p);
if (p.includes("[스타일 분석 요청]")) {
  process.stdout.write(JSON.stringify({ is_error: false, result: "\`\`\`json\\n" + JSON.stringify({
    style: { topic: "전세 실무", tone: "친근한 ~해요 말투", title_style: "숫자형", 모르는칸: "버림" },
    summary: "세입자용 정보 블로그", strengths: ["a", "b", "c", "d"],
    improvements: Array.from({ length: 8 }, (_, i) => ({ title: "개선" + i, why: "왜", how: "어떻게" })),
    priority: ["1", "2", "3", "4"], confidence: 1.7 }) + "\\n\`\`\`" }));
  process.exit(0);
}
if (p.includes("[검수 요청]")) {
  process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify({ summary: "ok", items: [] }) }));
  process.exit(0);
}
const 글 = { keyword: "시험 키워드 조합", title: "시험 키워드 조합 알아 두면 손해 안 보는 3가지 기준",
  content: "가짜 본문입니다. ".repeat(260), image_query: "test", tags: ["#가","#나","#다","#라","#마"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-st";
process.env.NAVER_FAKE = "1";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const S = await import("../src/db/repositories/settings.js");
const C = await import("../src/db/repositories/categories.js");
const B = await import("../src/naver/내블로그.js");
const A = await import("../src/claude/스타일분석.js");
const { generatePost } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");
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

console.log("\n① 블로그 주소 알아보기");
참("blog.naver.com/abc", B.블로그아이디("https://blog.naver.com/abc_12") === "abc_12");
참("m.blog.naver.com/abc/123", B.블로그아이디("m.blog.naver.com/abc/223344") === "abc");
참("PostList.naver?blogId=abc", B.블로그아이디("https://blog.naver.com/PostList.naver?blogId=abc&x=1") === "abc");
참("아이디만", B.블로그아이디("abc") === "abc");
참("엉뚱한 주소는 null", B.블로그아이디("https://example.com/a b") === null && B.블로그아이디("") === null);

console.log("\n② RSS·본문 읽기, 숫자 세기");
const rss = `<rss><channel><item><category><![CDATA[부동산]]></category><title><![CDATA[전세 <b>계약</b> &amp; 특약]]></title>
<link><![CDATA[https://blog.naver.com/abc/224411112222?fromRss=true]]></link><description><![CDATA[<p>요약&nbsp;입니다</p>]]></description>
<pubDate>Mon, 29 Sep 2026 10:00:00 +0900</pubDate></item><item><title>두 번째</title><link>https://blog.naver.com/PostView.naver?blogId=abc&amp;logNo=99887766</link>
<pubDate>Fri, 19 Sep 2026 10:00:00 +0900</pubDate></item></channel></rss>`;
const 읽은 = B.RSS읽기(rss);
참("제목·카테고리·날짜·글번호", 읽은.length === 2 && 읽은[0].title === "전세 계약 & 특약" && 읽은[0].category === "부동산"
  && 읽은[0].date === "2026-09-29" && 읽은[0].logNo === "224411112222" && 읽은[1].logNo === "99887766");
참("요약에서 태그를 걷는다", 읽은[0].summary === "요약 입니다");
const html = `<html><script>var x=1</script><div class="se-main-container"><p class="se-text-paragraph">첫 문단이에요.</p>
<p>둘째<br>줄&#33;</p><script>bad()</script></div><div class="se-viewer-footer">공감 댓글</div></html>`;
const 몸 = B.본문뽑기(html);
참("본문 글자만, 줄 나눔 유지, 바닥글 빼기", 몸 === "첫 문단이에요.\n둘째\n줄!" );
const 숫자 = B.숫자세기([
  { title: "전세 3가지?", category: "가", date: "2026-09-01", summary: "", body: "좋아요.\n".repeat(60) + "😊", logNo: "1" },
  { title: "월세", category: "가", date: "2026-09-15", summary: "", body: "", logNo: "2" },
  { title: "대출", category: "나", date: "2026-09-29", summary: "", body: "그렇다.\n".repeat(80), logNo: "3" },
]);
참("글수·본문수·주당·카테고리", 숫자.글수 === 3 && 숫자.본문수 === 2 && 숫자.주당 === 0.8 && 숫자.카테고리[0].이름 === "가" && 숫자.카테고리[0].수 === 2);
참("숫자·물음표 제목 33%", 숫자.제목숫자 === 33 && 숫자.제목물음 === 33);
참("«~요» 비율·이모지 비율", 숫자.요체 === 43 && 숫자.이모지 === 50);

console.log("\n③ AI 답 다듬기 — 모르는 칸·넘치는 개수·확실도");
const 날 = A.분석답읽기("```json\n{\"style\":{\"tone\":\"~해요\",\"x\":\"y\"},\"strengths\":[1,2,3,4],\"improvements\":[{\"title\":\"\"},{\"title\":\"t\"}],\"confidence\":\"0.4\"}\n```");
참("모르는 칸은 버리고 강점 3개까지, 빈 개선은 빼고, 확실도 0.4", 날.style.tone === "~해요" && !("x" in 날.style)
  && 날.strengths.length === 3 && 날.improvements.length === 1 && 날.confidence === 0.4);
let 던짐 = false;
try { A.분석답읽기("{\"style\":{}}"); } catch { 던짐 = true; }
참("스타일이 비면 오류로 알린다", 던짐);
참("승인 블록은 빈 칸을 빼고 1400자 이내", A.승인스타일블록({ tone: "친근", topic: "" }).includes("- 말투: 친근")
  && !A.승인스타일블록({ tone: "친근" }).includes("주로 다루는 주제") && A.승인스타일블록({ tone: "가".repeat(5000) }).length <= 1400);
참("아무것도 없으면 빈 블록", A.승인스타일블록({}) === "");

console.log("\n④ 화면 API — 분석 → 승인 → 적용");
상태적기(true, "", "claude");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-st" };
const 처음 = (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json();
참("처음엔 버전 없음·적용 꺼짐", 처음.current === null && 처음.apply === false && 처음.remaining === null);
참("엉뚱한 주소는 400", (await app.inject({ method: "POST", url: "/api/style/analyze", headers: 주인, payload: { url: "http://x.com" } })).statusCode === 400);
const 분석 = await app.inject({ method: "POST", url: "/api/style/analyze", headers: 주인, payload: { url: "blog.naver.com/myblog" } });
const 분석답 = 분석.json();
참(`분석이 돈다 (${분석.statusCode})`, 분석.statusCode === 200 && 분석답.ver === 1 && 분석답.approvedAt === null);
참("숫자도 함께 저장(글 10편, 본문 6편)", 분석답.stats.글수 === 10 && 분석답.stats.본문수 === 6 && 분석답.blogId === "myblog");
참("개선 6개·먼저 할 것 3개로 자름, 확실도 1 로", 분석답.analysis.improvements.length === 6 && 분석답.analysis.priority.length === 3 && 분석답.analysis.confidence === 1);
참("AI 에 셈한 숫자와 글 제목을 넘긴다", 지시문().includes("[스타일 분석 요청]") && 지시문().includes("주당") && 지시문().includes("전세 계약 전 등기부등본"));
참("주소를 기억한다", (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json().blogUrl === "blog.naver.com/myblog");

참("승인 전에는 적용 체크가 400", (await app.inject({ method: "PUT", url: "/api/style/apply", headers: 주인, payload: { on: true } })).statusCode === 400);
참("«직접 확인» 없이 승인은 400", (await app.inject({ method: "PUT", url: `/api/style/${분석답.id}/approve`, headers: 주인, payload: { analysis: 분석답.analysis } })).statusCode === 400);
참("스타일이 다 비면 승인 400", (await app.inject({ method: "PUT", url: `/api/style/${분석답.id}/approve`, headers: 주인, payload: { analysis: {}, confirmed: true } })).statusCode === 400);
const 고친 = { ...분석답.analysis, style: { ...분석답.analysis.style, tone: "사람이 고친 말투 ~해요", avoid: "법률 단정" } };
const 승인 = (await app.inject({ method: "PUT", url: `/api/style/${분석답.id}/approve`, headers: 주인, payload: { analysis: 고친, confirmed: true } })).json();
참("승인하면 고친 내용으로 저장", !!승인.approvedAt && 승인.analysis.style.tone === "사람이 고친 말투 ~해요");
const 뒤 = (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json();
참("승인 버전이 «쓰는 버전», 적용은 아직 꺼짐", 뒤.activeId === 분석답.id && 뒤.apply === false);

const 카 = C.createCategory({ name: "시험", requiresSearch: false, promptHint: "시험" });
await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
참("적용 끄면 글쓰기 지시문에 스타일이 없다(예전과 같음)", !지시문().includes("[내 블로그 스타일"));
참("적용 켜기 200", (await app.inject({ method: "PUT", url: "/api/style/apply", headers: 주인, payload: { on: true } })).statusCode === 200);
const 기록1 = { } as any;
await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0], 기록1);
참("적용 켜면 승인 스타일이 지시문에", 지시문().includes("[내 블로그 스타일") && 지시문().includes("사람이 고친 말투 ~해요"));
참("생성 기록에 스타일 버전", 기록1.스타일버전 === 1);

const 글 = await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
await app.inject({ method: "POST", url: `/api/posts/${글.id}/review`, headers: 주인, payload: {} });
참("최종 검수도 승인 스타일을 기준으로", 지시문().includes("[검수 요청]") && 지시문().includes("사람이 고친 말투 ~해요"));

// 두 번째 분석 → 승인 → 첫 버전으로 되돌리기
const 둘 = (await app.inject({ method: "POST", url: "/api/style/analyze", headers: 주인, payload: { url: "myblog" } })).json();
참("다시 분석하면 v2 초안, 쓰는 버전은 그대로 v1", 둘.ver === 2 && (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json().activeId === 분석답.id);
await app.inject({ method: "PUT", url: `/api/style/${둘.id}/approve`, headers: 주인, payload: { analysis: 둘.analysis, confirmed: true } });
참("v2 승인 → 쓰는 버전 v2", (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json().activeId === 둘.id);
참("v1 로 되돌리기", (await app.inject({ method: "PUT", url: "/api/style/active", headers: 주인, payload: { id: 분석답.id } })).statusCode === 200
  && (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json().activeId === 분석답.id);
await app.inject({ method: "PUT", url: "/api/style/apply", headers: 주인, payload: { on: false } });
await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
참("적용 끄면 바로 예전처럼", !지시문().includes("[내 블로그 스타일"));

console.log("\n⑤ 체험 키 — 내 자리만, 하루 3번");
const 체험 = { "x-dashboard-token": openSession({ key1: "T-ST", key2: "T-ST-PC", remoteToken: "r", role: "client" }) };
const 체험처음 = (await app.inject({ method: "GET", url: "/api/style", headers: 체험 })).json();
참("주인 분석은 안 보인다, 남은 횟수 3", 체험처음.current === null && 체험처음.remaining === 3);
참("주인 버전은 열 수 없다(404)", (await app.inject({ method: "GET", url: `/api/style/${분석답.id}`, headers: 체험 })).statusCode === 404);
const 코드들: number[] = [];
for (let i = 0; i < 4; i++) 코드들.push((await app.inject({ method: "POST", url: "/api/style/analyze", headers: 체험, payload: { url: "myblog" } })).statusCode);
참(`3번은 되고 4번째는 429 (${코드들.join(",")})`, 코드들.slice(0, 3).every((c) => c === 200) && 코드들[3] === 429);
참("주인 쪽은 그대로 v1 이 쓰는 버전", (await app.inject({ method: "GET", url: "/api/style", headers: 주인 })).json().activeId === 분석답.id);
await app.close();

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
