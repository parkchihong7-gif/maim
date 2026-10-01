/**
 * **조사(시간 한도) → 글쓰기(도구 없음) 두 단계와 자료 메모** 를 시험한다.
 *
 *     npx tsx tests/test-자료메모.ts
 *
 * 겪은 일 — 블로그 참고 주소를 넣어 두자, «검색 없이 창작» 카테고리(생활 꿀팁)까지
 * 글을 쓰는 한 번의 부름 안에서 그 주소들을 열다가 600초를 넘겨 실패했다.
 * 잘 안 열리는 곳(네이버 블로그·인스타·유튜브)에서 AI 가 횟수 제한 없이 다시 시도했다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-brief-"));
const 기록 = path.join(임시, "calls.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
const 느림 = path.join(임시, "SLOW_RESEARCH");
const 짧게 = path.join(임시, "SHORT");
// 부른 것을 줄마다 남긴다: 조사인가 글쓰기인가, 무슨 도구, 지시문 일부.
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const 물음 = a[a.indexOf("-p") + 1] || "";
const 도구 = a.includes("--allowedTools") ? a.slice(a.indexOf("--allowedTools") + 1).filter((x) => /^Web/.test(x)).join("+")
  : (a.includes("--tools") ? "없음" : "?");
const 조사 = 물음.includes("자료만 빠르게");
const 늘리기 = 물음.includes("[방금 쓴 글]");
fs.appendFileSync(${JSON.stringify(기록)}, JSON.stringify({ 조사, 늘리기, 도구,
  블로그읽기: 물음.includes("■ blog_brief"), 카테고리읽기: 물음.includes("■ brief"), 소식: 물음.includes("■ news"),
  블로그메모: 물음.includes("(블로그 메모 —"), 카테고리메모: 물음.includes("(카테고리 메모 —"), 최근소식: 물음.includes("(최근 소식 —"),
  못모음: 물음.includes("자료를 모으지 못했다"), 열어보라: 물음.includes("먼저 열어 보라") }) + "\\n");
if (조사) {
  if (fs.existsSync(${JSON.stringify(느림)})) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 4000);
  const 답 = { blog_brief: 물음.includes("■ blog_brief") ? "(블로그) 동네 생활 정보와 절약 팁을 주로 다룬다. ".repeat(5) : "",
    brief: 물음.includes("■ brief") ? "(통계청 KOSIS) 2026년 9월 소비자물가 2.1% 상승. ".repeat(5) : "",
    news: 물음.includes("■ news") ? "(2026-09-30, 연합뉴스) 장바구니 물가 상승 둔화" : "" };
  process.stdout.write(JSON.stringify({ is_error: false, num_turns: 5, result: JSON.stringify(답) }));
  process.exit(0);
}
const 짧은 = fs.existsSync(${JSON.stringify(짧게)}) && !늘리기;
const 글 = { keyword: "통계로 보는 생활 물가", title: "통계로 보는 생활 물가 장바구니 지출 줄이는 3가지 기준",
  content: (짧은 ? "짧은 본문입니다. ".repeat(60) : "통계로 보는 생활 물가 이야기. ".repeat(160)), image_query: "grocery prices",
  tags: ["#물가","#통계","#생활"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, num_turns: 1, modelUsage: { "claude-sonnet-x": { outputTokens: 900 }, "claude-haiku-x": { outputTokens: 50 } }, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.RESEARCH_READ_TIMEOUT_MS = "2000";
process.env.RESEARCH_NEWS_TIMEOUT_MS = "2000";
delete process.env.AI_ENGINE;

const { getDb } = await import("../src/db/index.js");
const { 자리에서, 주인 } = await import("../src/tenancy.js");
const C = await import("../src/db/repositories/categories.js");
const S = await import("../src/db/repositories/settings.js");
const 예약 = await import("../src/scheduler/예약.js");
const M = await import("../src/pipeline/자료메모.js");
const { generatePost, 빈기록 } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
const { 사진고르기시간 } = await import("../src/pipeline/attachImage.js");
const db = getDb();

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 부름 = () => fs.readFileSync(기록, "utf8").trim().split("\n").filter(Boolean).map((x) => JSON.parse(x));
const 지우기 = () => fs.writeFileSync(기록, "");
const 쓰기 = (c: Parameters<typeof generatePost>[0]) => {
  const 기 = 빈기록();
  return 자리에서(주인, () => generatePost(c, assignDirectives(1)[0], 기)).then((post) => ({ post, 기 }));
};
자리에서(주인, () => S.최소분량정하기(1500));
const 블로그주소 = JSON.stringify([{ kind: "blog", url: "https://blog.naver.com/me", note: "" },
  { kind: "instagram", url: "https://instagram.com/me", note: "" }]);
자리에서(주인, () => S.개인설정정하기("blog_links", 블로그주소));

const 카 = 자리에서(주인, () => C.createCategory({
  name: "통계로 보는 생활", requiresSearch: false, promptHint: "통계 숫자를 쉽게 풀어서",
  mainUrl: "https://kosis.kr", referenceUrls: "https://www.index.go.kr",
}));

console.log("\n① 첫 글 — 조사(주소 읽기, 도구 켬) → 글쓰기(도구 없음). 메모 둘을 남긴다");
지우기();
let { 기 } = await 쓰기(카);
let 콜 = 부름();
참("조사 1번 + 글쓰기 1번", 콜.length === 2 && 콜[0].조사 && !콜[1].조사);
참("조사: 검색+주소 열기", 콜[0].도구 === "WebSearch+WebFetch");
참("조사: 블로그·카테고리 주소 읽기 + 최근 소식", 콜[0].블로그읽기 && 콜[0].카테고리읽기 && 콜[0].소식);
참("글쓰기: 도구 없음", 콜[1].도구 === "없음");
참("글쓰기: 세 자료를 받는다", 콜[1].블로그메모 && 콜[1].카테고리메모 && 콜[1].최근소식);
참("글쓰기에 «먼저 열어 보라» 가 없다", !콜[1].열어보라);
const 뒤1 = 자리에서(주인, () => C.getCategory(카.id))!;
참("카테고리 메모 저장", (뒤1.research_brief ?? "").includes("KOSIS"));
참("블로그 메모 저장 (자리에 하나)", !!자리에서(주인, () => M.쓸블로그메모(블로그주소)));
참("기록: 첫글·조사 시간·모델", 기.첫글 && 기.조사ms > 0 && 기.모델 === "claude-sonnet-x" && 기.조사횟수 === 5);

console.log("\n② 두 번째 글 — 조사는 최근 소식만(검색만), 주소는 안 연다");
지우기();
({ 기 } = await 쓰기(뒤1));
콜 = 부름();
참("조사: 검색만", 콜[0].조사 && 콜[0].도구 === "WebSearch");
참("조사: 주소 읽기 없음, 소식만", !콜[0].블로그읽기 && !콜[0].카테고리읽기 && 콜[0].소식);
참("글쓰기: 메모 둘 + 소식", 콜[1].블로그메모 && 콜[1].카테고리메모 && 콜[1].최근소식);
참("기록: 메모 씀", 기.메모씀 && !기.첫글);

console.log("\n③ «검색 없이 창작» 카테고리 — 블로그 메모만 넣고 조사 없이 바로 쓴다 (생활 꿀팁)");
const 꿀팁 = 자리에서(주인, () => C.createCategory({ name: "생활 꿀팁", requiresSearch: false, promptHint: "생활 속 실용적인 팁. 검색 없이 창작." }));
지우기();
await 쓰기(꿀팁);
콜 = 부름();
참("부른 것은 글쓰기 1번뿐", 콜.length === 1 && !콜[0].조사);
참("도구 없음", 콜[0].도구 === "없음");
참("블로그 메모는 들어간다", 콜[0].블로그메모);

console.log("\n④ 메모가 낡는 때");
자리에서(주인, () => C.updateCategory(카.id, { referenceUrls: "https://www.index.go.kr\nhttps://www.bok.or.kr" }));
const 뒤4 = 자리에서(주인, () => C.getCategory(카.id))!;
참("카테고리 주소를 바꾸면 카테고리 메모를 안 쓴다", M.쓸메모(뒤4) === null);
참("7일이 지나면 안 쓴다", M.쓸메모(뒤1, Date.now() + 8 * 86_400_000) === null);
참("블로그 주소를 바꾸면 블로그 메모를 안 쓴다", 자리에서(주인, () => M.쓸블로그메모("[]")) === null);
자리에서(주인, () => C.메모적기(카.id, null, null));
참("[다시 읽기] 로 카테고리 메모가 지워진다", 자리에서(주인, () => C.getCategory(카.id))!.research_brief === null);

console.log("\n⑤ 조사가 시간을 넘기면 — 기다리지 않고, 조사 없이 글은 나온다");
fs.writeFileSync(느림, "1");
지우기();
const 시작 = Date.now();
({ 기 } = await 쓰기(자리에서(주인, () => C.getCategory(카.id))!));
const 걸림 = Date.now() - 시작;
fs.rmSync(느림);
콜 = 부름();
참("글은 나왔다", 콜.some((x) => !x.조사));
참("조사 한도(2초) 근처에서 끊었다", 걸림 < 3500);
참("기록: 조사 실패 까닭", !!기.조사실패);
참("글쓰기에 «자료를 모으지 못했다» 를 알린다 — 지어내지 말라고", 콜[콜.length - 1].못모음 || 콜[콜.length - 1].블로그메모);

console.log("\n⑥ 분량만 모자라면 — 시간이 남을 때만, 검색 없이 늘리게만");
fs.writeFileSync(짧게, "1");
지우기();
({ 기 } = await 쓰기(꿀팁));
콜 = 부름();
fs.rmSync(짧게);
참("두 번째는 늘리기, 도구 없음", 콜.length === 2 && 콜[1].늘리기 && 콜[1].도구 === "없음");
참("기록: 다시=분량", 기.다시.join() === "분량");

console.log("\n⑦ 사진 고르기 시간 — 5분 안에 맞춘다");
참("처음엔 60초", 사진고르기시간(60_000) === 60_000);
참("4분 30초가 지났으면 AI 없이", 사진고르기시간(270_000) === 0);
참("4분이 지났으면 남은 만큼(40초)", 사진고르기시간(240_000) === 40_000);

console.log("\n⑧ 하루 포스팅 수를 뺐다 — 켜진 카테고리마다 한 편, 예전의 0(쉼)은 꺼짐으로");
db.prepare("UPDATE categories SET daily_count = 0 WHERE id = ?").run(꿀팁.id);
db.prepare("UPDATE categories SET daily_count = 5 WHERE id = ?").run(카.id);
db.exec("UPDATE categories SET active = 0, daily_count = 1 WHERE daily_count = 0");
참("0 이던 것은 꺼졌다", 자리에서(주인, () => C.getCategory(꿀팁.id))!.active === 0);
S.setSetting("daily_cap", "10");
const 목록 = 자리에서(주인, () => 예약.오늘목록("sequential"));
참("편수가 5 여도 한 편", 목록.filter((x) => x.category.id === 카.id).length === 1);
참("꺼진 것은 안 들어간다", !목록.some((x) => x.category.id === 꿀팁.id));

console.log(틀린것 ? `\n❌ ${틀린것}개 틀림` : "\n✅ 모두 통과");
process.exit(틀린것 ? 1 : 0);
