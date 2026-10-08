/**
 * **게임 블로그 전략 (A~F + 🎮 출시 달력)** 을 한 번에 시험한다.
 *
 *     npx tsx tests/test-게임전략.ts
 *
 * 2026-10-08 사장님 실측: «롤전적검색OP»(골드·메인 노출) 유입 22 · «피파온라인4» 44 ·
 * «도깨비의 세계 직업·스킬 조합»(출시 전날) 2,810. →
 *   A 🚪 이동형 거르기 · 📘 정보형 먼저   E 유입 기록·레인별 평균   B 🔥 급상승(일 단위)
 *   D 후속 글 사슬   F 이슈 글 규칙   C 🎮 출시 달력 A~F 단계 · 🔔 홈 알림 · 🔍 출시 예정 찾기
 */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-game-"));
const 기록 = path.join(임시, "prompt.txt");
const 진짜가짜 = path.resolve("tools/fake-claude.mjs");
const 가짜 = path.join(임시, "fake-claude.mjs");
// 글쓰기 지시문을 파일로 남기고, 나머지는 tools/fake-claude.mjs 에 맡긴다.
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (p.includes("[최우선 지시") || p.includes("[🔥 이슈 글 규칙")) fs.writeFileSync(${JSON.stringify(기록)}, p);
await import(${JSON.stringify(진짜가짜)});
`);
fs.chmodSync(가짜, 0o755);

const 오늘 = new Date();
const 날 = (n: number) => new Date(오늘.getTime() + n * 864e5).toISOString().slice(0, 10);
const 가짜네이버 = JSON.parse(fs.readFileSync("tools/fake-naver.json", "utf8"));
const 뜬날 = Array.from({ length: 30 }, (_, i) => (i >= 27 ? 90 : 20));     // 마지막 3일 폭발
const 새말 = Array.from({ length: 30 }, (_, i) => (i >= 27 ? 60 : 0));       // 전에는 없던 말
const 잠잠 = Array.from({ length: 30 }, () => 30);
가짜네이버.trendDaily = { "도깨비의세계 직업 추천": 뜬날, "별빛 연대기": 새말, "피파온라인4 공략": 잠잠 };
가짜네이버.news = { total: 3, items: [
  { title: "<b>도깨비의 세계</b> 오늘 출시", description: "", pubDate: new Date(오늘.getTime() - 3600e3).toUTCString() },
  { title: "사전예약 100만", description: "", pubDate: new Date(오늘.getTime() - 86400e3).toUTCString() },
  { title: "옛 기사", description: "", pubDate: new Date(오늘.getTime() - 20 * 86400e3).toUTCString() } ] };
const 네이버파일 = path.join(임시, "fake-naver.json");
fs.writeFileSync(네이버파일, JSON.stringify(가짜네이버));

process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-game";
process.env.NAVER_FAKE = "1";
process.env.NAVER_FAKE_FILE = 네이버파일;
process.env.NAVER_GAP_MS = "0";
process.env.PEXELS_API_KEY = "pexels-test-key-0000000000000";
delete process.env.KEYSERVER_URL;
// 사진 사이트는 막혀 있다 — 빨리 실패하게(글은 imageError 와 함께 나온다).
const 진짜fetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.startsWith("http://localhost") || u.startsWith("http://127.")) return 진짜fetch(url, init);
  return new Response("{}", { status: 503 });
}) as typeof fetch;

let 틀린것 = 0;
function 참(말: string, 값: boolean) { if (값) console.log(`   ✅ ${말}`); else { console.log(`   ❌ ${말}`); 틀린것 += 1; } }

const { getDb } = await import("../src/db/index.js");
getDb();
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/db/repositories/keywordPool.js");
const K = await import("../src/naver/키워드점수.js");
const 개 = await import("../src/naver/개인화점수.js");
const T = await import("../src/naver/검색어트렌드.js");
const 급 = await import("../src/naver/급상승.js");
const 계 = await import("../src/pipeline/출시계획.js");
const 전 = await import("../src/pipeline/글전략.js");
const { buildServer } = await import("../src/web/server.js");

console.log("\nA 🚪 이동형 · 📘 정보형");
참("롤전적검색OP → 이동형", K.의도보기("롤전적검색OP") === "nav");
참("롤 전적 검색 → 이동형", K.의도보기("롤 전적 검색") === "nav");
참("도깨비의세계 직업 추천 → 정보형", K.의도보기("도깨비의세계 직업 추천") === "info");
참("피파온라인4 → 그 밖", K.의도보기("피파온라인4") === "plain");
참("«op» 가 낱말 속에 든 것은 이동형 아님 (topgun)", K.의도보기("topgun 후기") === "info");
const 이동 = 개.개인화점수({ keyword: "롤전적검색OP", grade: "gold", pc: 1000, mobile: 3000 }, []);
const 정보 = 개.개인화점수({ keyword: "롤 챔피언 추천", grade: "gold", pc: 1000, mobile: 3000 }, []);
참(`골드라도 이동형은 점수가 낮다 (${이동.score} < ${정보.score})`, 이동.score < 정보.score && 이동.why.some((w) => w.includes("이동형")));

const 카 = C.createCategory({ name: "게임", requiresSearch: false, promptHint: "게임 공략·출시 소식" });
C.키워드칸적기(카.id, { kw_apply: 1 } as never);
const 넣기 = (keyword: string, grade: "gold" | "silver", 량: number) => P.보관함넣기(카.id, {
  keyword, pc: 량 / 4, mobile: (량 * 3) / 4, comp: "낮음", doc_total: 100, ratio: grade === "gold" ? 0.1 : 0.7, grade, seed: "게임", top: [] });
넣기("롤전적검색OP", "gold", 50000);
넣기("피파온라인4 공략", "gold", 3000);
넣기("롤 챔피언 추천", "gold", 2000);
넣기("도깨비의세계 직업 추천", "silver", 500);
let 차례 = P.쓸차례(카.id).map((r) => r.keyword);
참(`이동형은 글쓰기 차례에서 빠진다 (${차례.join(" / ")})`, !차례.includes("롤전적검색OP"));
참("같은 골드면 정보형(공략·추천)이 먼저", 차례[0] === "피파온라인4 공략" || 차례[0] === "롤 챔피언 추천");

console.log("\nB 🔥 급상승 (일 단위)");
참("잠잠하면 없음", T.급상승보기(잠잠) === null);
참(`최근 3일 폭발 → +${T.급상승보기(뜬날)}%`, (T.급상승보기(뜬날) ?? 0) >= 300);
참("전에는 없던 말이 갑자기 → 새로 뜸(999)", T.급상승보기(새말) === 999);
참("바닥(5 미만)에서 조금 오른 것은 무시", T.급상승보기([...Array(27).fill(1), 4, 4, 4]) === null);
참("뉴스 3일 안 판정", 급.최근기사인가(new Date().toUTCString()) && !급.최근기사인가(new Date(Date.now() - 9 * 864e5).toUTCString()));
const 찾음 = await 급.급상승찾기(카.id, ["별빛 연대기"]);
참(`보관함+달력 말을 보고 ${찾음.rows.length}개 급상승 (${찾음.rows.map((r) => r.keyword).join(", ")})`,
  찾음.rows.some((r) => r.keyword === "도깨비의세계 직업 추천" && r.inPool) && 찾음.rows.some((r) => r.keyword === "별빛 연대기" && !r.inPool));
참("급상승에 최근 3일 뉴스 수가 붙는다 (2건)", 찾음.rows.find((r) => r.keyword === "도깨비의세계 직업 추천")?.news3d === 2);
차례 = P.쓸차례(카.id).map((r) => r.keyword);
참(`🔥 급상승은 등급(실버)과 상관없이 맨 앞 (${차례[0]})`, 차례[0] === "도깨비의세계 직업 추천");

console.log("\nF 이슈 글 규칙 · 레인");
참("주문 레인이 먼저", 전.레인정하기({ 레인: "info" }, { surge: 300 }, true) === "info");
참("급상승 보관 키워드 → 🔥 이슈", 전.레인정하기(undefined, { surge: 300, info: true }, false) === "issue");
참("정보형 보관 키워드 → 📘 정보형", 전.레인정하기(undefined, { surge: null, info: true }, false) === "info");
참("그 밖 → 🧱 일반", 전.레인정하기(undefined, null, false) === "general");
const 블록 = 전.전략블록("issue", "도깨비의 세계 직업 추천", "2026-10-08", { 각도: "직업 추천" });
참("이슈 규칙: 날짜 기준 한 줄 · 답 먼저 · 지어내지 않기 · 각도", 블록.includes("(2026년 10월 8일 기준)") && 블록.includes("먼저 말하라") && 블록.includes("지어내지 마라") && 블록.includes("[이번 글의 각도] 직업 추천"));

console.log("\nC 🎮 출시 계획 A~F");
const 계획 = 계.계획짜기("별빛 연대기", "2026-10-20", "2026-10-19", { A: { post_id: 1 }, B: { skip: true } });
참("A 쓴 것 → 완료 · B → 건너뜀", 계획[0].상태 === "done" && 계획[1].상태 === "skip");
참("출시 전날 → C(직업 추천) 지금", 계획[2].key === "C" && 계획[2].상태 === "now" && 계획[2].키워드 === "별빛 연대기 직업 추천");
참("D·E·F 는 아직(곧)", 계획.slice(3).every((s) => s.상태 === "upcoming"));
참("C 권장일 = 출시 하루 전", 계획[2].권장일 === "2026-10-19");
참("D-day 글", 계.디데이글(계.디데이("2026-10-20", "2026-10-19")) === "D-1" && 계.디데이글(0) === "D-day" && 계.디데이글(-3) === "D+3");

console.log("\nC·D·E API — 달력 · 단계 글 · 후속 · 유입");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-game" };
const 넣은 = (await app.inject({ method: "POST", url: "/api/events", headers: 주인, payload: { title: "별빛 연대기", date: 날(1), categoryId: 카.id } })).json();
참(`게임 넣기 → 오늘은 ${넣은.event?.ddayText}, 지금 단계 ${넣은.event?.now}`, 넣은.ok && 넣은.event.ddayText === "D-1" && 넣은.event.now === "C");
const 틀린 = await app.inject({ method: "POST", url: "/api/events", headers: 주인, payload: { title: "x", date: "내일" } });
참("이름·날짜가 틀리면 400", 틀린.statusCode === 400);
const 오늘할일 = (await app.inject({ method: "GET", url: "/api/events/today", headers: 주인 })).json();
참(`🔔 홈 알림에 오늘 단계 (${오늘할일.items.map((x: any) => x.key + x.when).join(",")})`, 오늘할일.items.some((x: any) => x.key === "C" && x.when === "now"));
const 만든 = await app.inject({ method: "POST", url: `/api/events/${넣은.event.id}/steps/C/generate`, headers: 주인 });
const 글 = 만든.json();
참(`C단계 글이 나온다 (${만든.statusCode})`, 만든.statusCode === 200 && !!글.id);
const 행 = getDb().prepare("SELECT lane, kw, angle, event_id, event_step FROM posts WHERE id = ?").get(글.id) as any;
참(`글에 레인·키워드·단계가 적힌다 (${행?.lane} · ${행?.kw} · ${행?.event_step})`, 행?.lane === "issue" && 행?.kw === "별빛 연대기 직업 추천" && 행?.event_step === "C");
const 지시 = fs.existsSync(기록) ? fs.readFileSync(기록, "utf8") : "";
참("지시문에 🔥 이슈 규칙 · 🎮 일정 · 단계 각도", 지시.includes("[🔥 이슈 글 규칙") && 지시.includes("[🎮 일정] «별빛 연대기»") && 지시.includes("직업·클래스 추천·조합"));
참("지시문의 주제 키워드 = 단계 키워드", 지시.includes('"별빛 연대기 직업 추천"'));
const 다시 = (await app.inject({ method: "GET", url: "/api/events", headers: 주인 })).json();
const C단계 = 다시.events[0].steps.find((s: any) => s.key === "C");
참("C단계가 ✔ 완료로 바뀌고 글 제목이 붙는다", C단계.상태 === "done" && !!C단계.postTitle);
const 건너 = (await app.inject({ method: "POST", url: `/api/events/${넣은.event.id}/steps/A/skip`, headers: 주인 })).json();
참("A 건너뛰기", 건너.event.steps[0].상태 === "skip");

const 이력 = (await app.inject({ method: "GET", url: "/api/history", headers: 주인 })).json();
const 그글 = 이력.find((p: any) => p.id === 글.id);
참("단계 글은 후속 버튼 대상이 아니다 (다음 단계가 이어짐)", !그글.followups);
// 급상승 보관 키워드로 [지금 생성] 한 것처럼 — 이슈 글 하나를 직접 만든다
getDb().prepare("UPDATE posts SET angle = NULL, event_step = NULL, event_id = NULL WHERE id = ?").run(글.id);
const 이력2 = (await app.inject({ method: "GET", url: "/api/history", headers: 주인 })).json();
const 이슈글 = 이력2.find((p: any) => p.id === 글.id);
참("이슈 글에는 후속 D+1·D+3·D+7", 이슈글.followups?.length === 3 && 이슈글.followups.every((f: any) => !f.done));
const 후속 = await app.inject({ method: "POST", url: `/api/posts/${글.id}/follow-up`, headers: 주인, payload: { kind: "d1" } });
참(`D+1 후속 글 (${후속.statusCode})`, 후속.statusCode === 200 && !!후속.json().id);
const 이력3 = (await app.inject({ method: "GET", url: "/api/history", headers: 주인 })).json();
참("D+1 이 ✔ 로 바뀐다", 이력3.find((p: any) => p.id === 글.id).followups.find((f: any) => f.kind === "d1").done === true);

const 유입 = await app.inject({ method: "PUT", url: `/api/posts/${글.id}/inflow`, headers: 주인, payload: { inflow: 2810 } });
await app.inject({ method: "PUT", url: `/api/posts/${후속.json().id}/inflow`, headers: 주인, payload: { inflow: "190" } });
const 통계 = (await app.inject({ method: "GET", url: "/api/history/lanes", headers: 주인 })).json();
const 이슈 = 통계.lanes.find((l: any) => l.lane === "issue");
참(`유입 적기 → 🔥 이슈 평균 ${이슈?.avg} (2편)`, 유입.statusCode === 200 && 이슈?.withInflow === 2 && 이슈?.avg === 1500 && 이슈?.best?.inflow === 2810);
참("숫자가 아니면 400", (await app.inject({ method: "PUT", url: `/api/posts/${글.id}/inflow`, headers: 주인, payload: { inflow: "많음" } })).statusCode === 400);

const 찾기 = (await app.inject({ method: "POST", url: "/api/events/discover", headers: 주인, payload: {} })).json();
참(`🔍 출시 예정 찾기 — 지난 것·이미 있는 것 빼고 (${찾기.games?.map((g: any) => g.title).join(", ")})`,
  찾기.ok && 찾기.games.length === 1 && 찾기.games[0].title === "아이언 프론티어");

const 체험 = { "x-dashboard-token": "nope" };
참("체험 키는 달력 403", (await app.inject({ method: "GET", url: "/api/events", headers: 체험 })).statusCode !== 200);
참("체험 키는 후속 글 403", (await app.inject({ method: "POST", url: `/api/posts/${글.id}/follow-up`, headers: 체험, payload: { kind: "d1" } })).statusCode !== 200);
참("지우기", (await app.inject({ method: "DELETE", url: `/api/events/${넣은.event.id}`, headers: 주인 })).json().ok === true);

await app.close();
console.log(틀린것 ? `\n❌ ${틀린것}개 틀렸습니다.` : "\n전부 통과했습니다.");
process.exit(틀린것 ? 1 : 0);
