/**
 * **D. ✍️ 글 작업실 · E. 🔎 키워드 탭 고도화** 를 시험한다.
 *
 *     npx tsx tests/test-작업실키워드.ts
 *
 * 인터넷도 진짜 AI 도 필요 없다. 네이버는 tools/fake-naver.json(NAVER_FAKE=1),
 * AI 는 받은 지시문을 파일에 적고 정해진 답을 주는 가짜다(tools/fake-claude.mjs 를 감싼다).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-wk-"));
const 기록 = path.join(임시, "prompts.txt");
const 가짜 = path.join(임시, "fake.mjs");
const 진짜가짜 = path.resolve("tools/fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(기록)}, "\\n=====\\n" + (a[a.indexOf("-p") + 1] ?? ""));
const r = spawnSync(process.execPath, [${JSON.stringify(진짜가짜)}, ...a], { encoding: "utf8" });
process.stdout.write(r.stdout);
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-wk";
process.env.NAVER_FAKE = "1";
process.env.NAVER_GAP_MS = "0";
process.env.UNSPLASH_ACCESS_KEY = "";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/keywordPool.js");
const 점수 = await import("../src/naver/개인화점수.js");
const 낱말 = await import("../src/naver/낱말세기.js");
const T = await import("../src/naver/검색어트렌드.js");
const W = await import("../src/pipeline/글작업실.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");
const { buildServer } = await import("../src/web/server.js");
const { 상태적기 } = await import("../src/ai/run.js");

getDb();
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 마지막지시 = () => fs.readFileSync(기록, "utf8").split("\n=====\n").pop() ?? "";

console.log("\n① 낱말 세기 · 개인화 점수 · 트렌드 흐름");
참("조사 떼고 두 글자 이상", JSON.stringify(낱말.낱말들("전세계약을 할 때 확정일자는 꼭!")) === JSON.stringify(["전세계약", "확정일자"]));
참("자주 낱말 — 글마다 한 번씩", 낱말.자주낱말(["전세 계약 전세", "전세 보증", "보증 계약"], 3)[0].count === 2);
const 카 = C.createCategory({ name: "전세 계약", requiresSearch: false, promptHint: "세입자를 위한 전세 정보" });
const 내 = 점수.내낱말(C.getCategory(카.id)!, { topic: "보증보험", readers: "" });
const 높 = 점수.개인화점수({ keyword: "전세계약특약", grade: "gold", pc: 880, mobile: 3100 }, 내);
const 낮 = 점수.개인화점수({ keyword: "제주도맛집", grade: "etc", pc: 50000, mobile: 90000 }, 내);
참(`맞는 키워드는 높게(${높.score}) · 안 맞으면 낮게(${낮.score})`, 높.score === 100 && 낮.score === 16);
참("근거를 함께 준다", 높.why.length === 3 && 높.why[1].includes("전세"));
참("오름 · 내림 · 보합", T.흐름보기([10, 10, 10, 20, 20, 20]).dir === "up" && T.흐름보기([20, 20, 20, 10, 10, 10]).dir === "down" && T.흐름보기([10, 10, 10, 11, 10, 10]).dir === "flat");

console.log("\n② E 화면 API — 씨앗 직접 · 직접 넣기 · 트렌드 · 전체 · 뉴스 · 벤치마킹");
상태적기(true, "", "claude");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-wk" };
const 부름 = (method: string, url: string, payload?: unknown) => app.inject({ method: method as any, url, headers: 주인, ...(payload ? { payload: payload as any } : {}) });

const 씨앗 = (await 부름("PUT", `/api/keywords/${카.id}/seeds`, { seeds: "전세특약, 확정일자 ,  , 보증보험" })).json();
참("씨앗 직접 저장(빈 것 빼고)", 씨앗.custom === true && JSON.stringify(씨앗.seeds) === JSON.stringify(["전세특약", "확정일자", "보증보험"]));
const 목록 = (await 부름("GET", "/api/keywords")).json();
참("탭 목록에 «직접 정한 씨앗» 표시", 목록.categories.find((c: any) => c.id === 카.id).customSeeds === true);
const 모음 = (await 부름("POST", `/api/keywords/${카.id}/collect`, {})).json();
참(`모으기는 직접 씨앗으로 (${모음.state})`, 모음.state === "done");

const 넣기 = await 부름("POST", `/api/keywords/${카.id}/add`, { keyword: "전세확정일자효력", from: "직접 추가" });
참(`직접 넣기 (${넣기.statusCode}, ${넣기.json().grade})`, 넣기.statusCode === 200 && 넣기.json().grade === "gold");
참("한 글자는 400", (await 부름("POST", `/api/keywords/${카.id}/add`, { keyword: "전" })).statusCode === 400);
await 부름("POST", `/api/keywords/${카.id}/add`, { keyword: "깡통전세구별", from: "뉴스:전세" });
const 다시 = (await 부름("POST", `/api/keywords/${카.id}/collect`, {})).json();
const 보관 = (await 부름("GET", `/api/keywords/${카.id}`)).json();
const 깡통 = 보관.items.find((r: any) => r.keyword === "깡통전세구별");
참(`다시 모아도 직접 넣은 것은 남는다 (${다시.state})`, !!깡통 && 깡통.manual === true && 깡통.seed === "직접:뉴스:전세");
참("줄마다 개인화 점수·근거", 보관.items.every((r: any) => typeof r.score === "number" && r.scoreWhy.length === 3));

const 트 = (await 부름("POST", `/api/keywords/${카.id}/trend`)).json();
const 보관2 = (await 부름("GET", `/api/keywords/${카.id}`)).json();
const 특약 = 보관2.items.find((r: any) => r.keyword === "전세계약특약");
참(`트렌드 적기 (${트.done}개)`, 트.done >= 5 && 특약.trend && 특약.trend.dir === "up" && 특약.trend.months.length === 12);

const 전체 = (await 부름("GET", "/api/keywords/all")).json();
참("전체 보관함에 카테고리 이름", 전체.items.length >= 5 && 전체.items.every((r: any) => r.categoryName === "전세 계약"));
const 뉴스 = (await 부름("GET", "/api/keywords/news?q=" + encodeURIComponent("전세"))).json();
참("뉴스 5개 + 자주 나온 말(찾은 말 빼고)", 뉴스.items.length === 5 && 뉴스.words.length > 0 && !뉴스.words.some((w: any) => w.word === "전세"));
const 벤치 = (await 부름("GET", "/api/keywords/bench?q=" + encodeURIComponent("전세 계약"))).json();
참(`블로그 묶기 — 많이 보인 순 (${벤치.blogs.map((b: any) => b.count).join(",")})`, 벤치.blogs.length >= 3 && 벤치.blogs[0].name === "전세지킴이" && 벤치.blogs[0].blogId === "jeonse_keeper");
const 그블 = (await 부름("GET", "/api/keywords/bench/blog?id=jeonse_keeper")).json();
참("고른 블로그의 제목·자주 쓰는 말(본문 안 읽음)", 그블.titles.length === 10 && 그블.words.length > 0);

console.log("\n③ D 글 작업실 — 시작 → 준비 → 승인 → 구간 → 저장");
const 방향 = (await 부름("GET", "/api/workshop/directions?kw=" + encodeURIComponent("전세계약특약"))).json();
참("검색 방향 후보(자기 자신 빼고, 검색량 순)", 방향.items.length > 3 && !방향.items.some((x: any) => x.keyword === "전세계약특약") && 방향.items[0].vol >= 방향.items[1].vol);
const 첫 = (await 부름("GET", "/api/workshop")).json();
참("작업실 첫 화면 — 보관함 키워드(쓸 등급만)", 첫.categories.find((c: any) => c.id === 카.id).pool.length > 0 && 첫.works.length === 0);
const 작업 = (await 부름("POST", "/api/workshop", { categoryId: 카.id, keyword: "전세계약특약", directions: ["전세계약주의사항", "전세확정일자"] })).json();
참("작업 시작 → 1단계", 작업.step === 1 && 작업.state.directions.length === 2);

const 미리승인 = await 부름("PUT", `/api/workshop/${작업.id}/approve`, { confirmed: true });
참("준비 전 승인은 400", 미리승인.statusCode === 400);
const 준비 = (await 부름("POST", `/api/workshop/${작업.id}/prepare`)).json();
참(`상위 5개 확보 (${준비.state.top.length}편, 평균 ${준비.state.topAvg}자)`, 준비.state.top.length === 5 && 준비.state.top[0].n === 1 && 준비.state.topAvg > 0);
참("원문은 저장하지 않는다(body 없음)", !JSON.stringify(준비.state.top).includes("\"body\"") && !(getDb().prepare("SELECT state_json FROM workshops").get() as { state_json: string }).state_json.includes("가짜 상위 글 본문"));
const 준지시 = 마지막지시();
참("AI 에 상위 글·[자료 n]·베끼지 말 것·방향", 준지시.includes("[글 준비 요청]") && 준지시.includes("[자료 1]") && 준지시.includes("베끼지 마라") && 준지시.includes("전세확정일자"));
참("준비 메모 → 2단계(목차 4·제목·내 자료 질문)", 준비.step === 2 && 준비.state.outline.length === 4 && 준비.state.title.length > 5 && 준비.state.prep.need.length === 3);

참("«직접 확인» 없이 승인 400", (await 부름("PUT", `/api/workshop/${작업.id}/approve`, {})).statusCode === 400);
const 빈목차 = 준비.state.outline.map((o: any, i: number) => (i === 2 ? { heading: "", point: "" } : o));
참("소제목이 비면 승인 400", (await 부름("PUT", `/api/workshop/${작업.id}/approve`, { confirmed: true, outline: 빈목차 })).statusCode === 400);
참("구간은 승인 뒤에만(400)", (await 부름("POST", `/api/workshop/${작업.id}/section/0`)).statusCode === 400);
const 승인 = (await 부름("PUT", `/api/workshop/${작업.id}/approve`, {
  confirmed: true, title: "전세 계약 특약 처음이라면 이 순서로", tags: ["#전세", "특약"],
  outline: 준비.state.outline, answers: ["작년에 노원구에서 직접 계약해 봄", "", ""],
})).json();
참("승인 → 3단계, 태그 # 떼기", 승인.step === 3 && JSON.stringify(승인.state.tags) === JSON.stringify(["전세", "특약"]));

const 구간1 = (await 부름("POST", `/api/workshop/${작업.id}/section/1`)).json();
const 구지시 = 마지막지시();
참("구간 2 를 먼저 써도 된다", 구간1.state.sections[1].startsWith(준비.state.outline[1].heading) && 구간1.state.sections[0] === "");
참("구간 지시문 — 이 구간 표시·내 자료·[자료 n]·되풀이 금지",
  구지시.includes("[구간 작성 요청]") && 구지시.includes("← 지금 쓸 구간") && 구지시.includes("작년에 노원구에서 직접 계약해 봄") && 구지시.includes("[자료 2]"));
참("저장은 4구간 다 쓴 뒤(400)", (await 부름("POST", `/api/workshop/${작업.id}/save`, {})).statusCode === 400);
for (const n of [0, 2, 3]) await 부름("POST", `/api/workshop/${작업.id}/section/${n}`);
const 고침 = (await 부름("GET", `/api/workshop/${작업.id}`)).json();
const 고친구간 = [...고침.state.sections];
고친구간[3] = 고친구간[3] + "\n사람이 덧붙인 문장입니다 [자료 3].";
const 저장전 = (await 부름("PUT", `/api/workshop/${작업.id}/sections`, { sections: 고친구간 })).json();
참("4구간 → 4단계, 사람 고친 것 저장", 저장전.step === 4 && 저장전.state.sections[3].includes("사람이 덧붙인"));

const 저장 = (await 부름("POST", `/api/workshop/${작업.id}/save`, { stripMarks: true })).json();
const 글 = getDb().prepare("SELECT * FROM posts WHERE id = ?").get(저장.postId) as any;
참("포스팅으로 저장 → 5단계", 저장.work.step === 5 && !!글 && 글.status === "ready" && 글.title === "전세 계약 특약 처음이라면 이 순서로");
참("본문의 [자료 n] 지움 · 사람 문장 유지 · 태그 #", !글.content.includes("[자료") && 글.content.includes("사람이 덧붙인 문장입니다.") && JSON.parse(글.tags_json)[0] === "#전세");
참("보관함 키워드는 «씀»", P.보관줄찾기(카.id, "전세계약특약")!.status === "used");
참("두 번 저장은 400", (await 부름("POST", `/api/workshop/${작업.id}/save`, {})).statusCode === 400);
참("작업 목록에 5단계 ✔", (await 부름("GET", "/api/workshop")).json().works[0].step === 5);

console.log("\n④ 체험 키 — 작업실·키워드 고도화는 주인만");
const 체험 = { "x-dashboard-token": openSession({ key1: "T-WK", key2: "T-WK-PC", remoteToken: "r", role: "client" }) };
const 코드 = await Promise.all([
  app.inject({ method: "GET", url: "/api/workshop", headers: 체험 }),
  app.inject({ method: "POST", url: "/api/workshop", headers: 체험, payload: { categoryId: 카.id, keyword: "x" } }),
  app.inject({ method: "GET", url: "/api/keywords/all", headers: 체험 }),
  app.inject({ method: "GET", url: "/api/keywords/news?q=a", headers: 체험 }),
  app.inject({ method: "PUT", url: `/api/keywords/${카.id}/seeds`, headers: 체험, payload: { seeds: "a" } }),
]).then((rs) => rs.map((r) => r.statusCode));
참(`모두 403 (${코드.join(",")})`, 코드.every((c) => c === 403));
await app.close();

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
