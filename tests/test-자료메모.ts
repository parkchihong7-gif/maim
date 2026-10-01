/**
 * **주소는 첫 글 때 한 번만 읽고, 두 번째 글부터는 자료 메모로 쓰는지** 시험한다.
 *
 *     npx tsx tests/test-자료메모.ts
 *
 * 겪은 일 — 옵션 없는 «일상 에세이» 한 편에 9분 30초, 대표·참고 주소 하나씩인
 * 카테고리 한 편에 6분 30초가 걸렸다. 매번 주소를 새로 열어 읽었고, 분량이
 * 모자라면 검색부터 통째로 다시 했다. 하루 포스팅 수도 함께 뺐다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-brief-"));
const 기록 = path.join(임시, "calls.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
// 부른 인자를 줄마다 남긴다. «자료 메모 남기기» 를 시키면 brief 를 돌려주고,
// «방금 쓴 글» 을 늘리라고 하면 긴 본문을 돌려준다. SHORT 파일이 있으면 첫 답을 짧게.
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const 물음 = a[a.indexOf("-p") + 1] || "";
const 도구 = a.includes("--allowedTools") ? a.slice(a.indexOf("--allowedTools") + 1).filter((x) => /^Web/.test(x)).join("+") : "없음";
const 늘리기 = 물음.includes("[방금 쓴 글]");
fs.appendFileSync(${JSON.stringify(기록)}, JSON.stringify({ 도구, 늘리기, 메모요청: 물음.includes("[자료 메모 남기기]"), 메모씀: 물음.includes("[자료 메모 —"), 주소열기: 물음.includes("먼저 열어 보라") }) + "\\n");
const 짧게 = fs.existsSync(${JSON.stringify(path.join(임시, "SHORT"))}) && !늘리기;
const 글 = { keyword: "통계로 보는 생활 물가", title: "통계로 보는 생활 물가 장바구니 지출 줄이는 3가지 기준",
  content: (짧게 ? "짧은 본문입니다. ".repeat(60) : "통계로 보는 생활 물가 이야기. ".repeat(160)), image_query: "grocery prices",
  tags: ["#물가","#통계","#생활"], title_variants: [] };
if (물음.includes("[자료 메모 남기기]")) 글.brief = "(통계청 KOSIS) 2026년 9월 소비자물가 2.1% 상승. ".repeat(6);
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
delete process.env.AI_ENGINE;

const { getDb } = await import("../src/db/index.js");
const { 자리에서, 주인 } = await import("../src/tenancy.js");
const C = await import("../src/db/repositories/categories.js");
const S = await import("../src/db/repositories/settings.js");
const 예약 = await import("../src/scheduler/예약.js");
const { 쓸메모 } = await import("../src/pipeline/자료메모.js");
const { generatePost } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
const db = getDb();

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 부름 = () => fs.readFileSync(기록, "utf8").trim().split("\n").map((x) => JSON.parse(x));
const 지우기 = () => fs.writeFileSync(기록, "");
자리에서(주인, () => S.최소분량정하기(1500));

const 카 = 자리에서(주인, () => C.createCategory({
  name: "통계로 보는 생활", requiresSearch: false, promptHint: "통계 숫자를 쉽게 풀어서",
  mainUrl: "https://kosis.kr", referenceUrls: "https://www.index.go.kr",
}));

console.log("\n① 첫 글 — 주소를 열고(WebFetch), 자료 메모를 함께 받아 남긴다");
지우기();
const 기1 = { 글ms: 0, 첫글: false, 메모씀: false, 다시: [] as string[] };
await 자리에서(주인, () => generatePost(카, assignDirectives(1)[0], 기1));
let 콜 = 부름();
참("한 번만 불렀다", 콜.length === 1);
참("검색+주소 열기 도구", 콜[0].도구 === "WebSearch+WebFetch");
참("메모를 남기라고 했다", 콜[0].메모요청 && !콜[0].메모씀);
const 뒤1 = 자리에서(주인, () => C.getCategory(카.id))!;
참("메모가 저장됐다", (뒤1.research_brief ?? "").includes("KOSIS") && !!뒤1.brief_at && !!뒤1.brief_sig);
참("기록: 첫글", 기1.첫글 && !기1.메모씀);

console.log("\n② 두 번째 글 — 주소를 열지 않고(검색만), 메모를 바탕으로 쓴다");
지우기();
const 기2 = { 글ms: 0, 첫글: false, 메모씀: false, 다시: [] as string[] };
await 자리에서(주인, () => generatePost(뒤1, assignDirectives(1)[0], 기2));
콜 = 부름();
참("검색만 (WebFetch 없음)", 콜[0].도구 === "WebSearch");
참("메모를 넣고, 다시 남기라고 하지 않는다", 콜[0].메모씀 && !콜[0].메모요청);
참("«먼저 열어 보라» 가 없다", !콜[0].주소열기);
참("기록: 메모 씀", 기2.메모씀 && !기2.첫글);

console.log("\n③ 주소를 바꾸면 메모는 낡은 것 — 다음 글이 다시 읽는다");
자리에서(주인, () => C.updateCategory(카.id, { referenceUrls: "https://www.index.go.kr\nhttps://www.bok.or.kr" }));
const 뒤3 = 자리에서(주인, () => C.getCategory(카.id))!;
참("지문이 달라 메모를 안 쓴다", 쓸메모(뒤3, null) === null);
참("7일이 지나도 안 쓴다", 쓸메모(뒤1, null, Date.now() + 8 * 86_400_000) === null);
참("블로그 참고 주소가 바뀌어도 안 쓴다", 쓸메모(뒤1, '[{"kind":"blog","url":"https://blog.naver.com/x"}]') === null);
자리에서(주인, () => C.메모적기(카.id, null, null));
참("[자료 다시 읽기] 로 지워진다", 자리에서(주인, () => C.getCategory(카.id))!.research_brief === null);

console.log("\n④ 분량만 모자라면 — 검색 없이 받은 글을 늘리게만 한다");
fs.writeFileSync(path.join(임시, "SHORT"), "1");
지우기();
const 기4 = { 글ms: 0, 첫글: false, 메모씀: false, 다시: [] as string[] };
const 글4 = await 자리에서(주인, () => generatePost(뒤3, assignDirectives(1)[0], 기4));
콜 = 부름();
참("두 번 불렀다", 콜.length === 2);
참("두 번째는 늘리기, 도구 없음", 콜[1].늘리기 && 콜[1].도구 === "없음");
참("늘린 본문을 썼다", (글4.content ?? "").length >= 1500);
참("기록: 다시=분량", 기4.다시.join() === "분량");
fs.rmSync(path.join(임시, "SHORT"));

console.log("\n⑤ 읽을 것 없는 카테고리는 도구도 메모도 없다");
const 수필 = 자리에서(주인, () => C.createCategory({ name: "일상 에세이", requiresSearch: false, promptHint: "하루를 돌아보는 짧은 글" }));
지우기();
await 자리에서(주인, () => generatePost(수필, assignDirectives(1)[0]));
콜 = 부름();
참("도구 없음", 콜[0].도구 === "없음");
참("메모 요청 없음", !콜[0].메모요청);

console.log("\n⑥ 하루 포스팅 수를 뺐다 — 켜진 카테고리마다 한 편, 예전의 0(쉼)은 꺼짐으로");
db.prepare("UPDATE categories SET daily_count = 0 WHERE id = ?").run(수필.id);
db.prepare("UPDATE categories SET daily_count = 5 WHERE id = ?").run(카.id);
// 시작할 때 옮기는 것을 다시 돌린다.
db.exec("UPDATE categories SET active = 0, daily_count = 1 WHERE daily_count = 0");
참("0 이던 것은 꺼졌다", 자리에서(주인, () => C.getCategory(수필.id))!.active === 0);
S.setSetting("daily_cap", "10");
const 목록 = 자리에서(주인, () => 예약.오늘목록("sequential"));
참("편수가 5 여도 한 편", 목록.filter((x) => x.category.id === 카.id).length === 1);
참("꺼진 것은 안 들어간다", !목록.some((x) => x.category.id === 수필.id));
const 새 = 자리에서(주인, () => C.createCategory({ name: "새것", requiresSearch: false, promptHint: "x", dailyCount: 7 } as never));
참("새 카테고리는 편수 1", 새.daily_count === 1);

console.log(틀린것 ? `\n❌ ${틀린것}개 틀림` : "\n✅ 모두 통과");
process.exit(틀린것 ? 1 : 0);
