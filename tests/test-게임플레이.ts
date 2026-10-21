/**
 * **🕹️ 게임 스샷** 을 한 번에 시험한다 (가짜 AI 로 돈다). 2026-10-21 개편 — 단축키 스샷만 남김.
 *
 *     npx tsx tests/test-게임플레이.ts
 *
 *  ① 칸막이 — 체험·**판매용** 키 404, 집 PC 토큰 틀리면 401, 저장통 없으면 기능 꺼짐
 *  ② 집 PC 흐름 — 하트비트로 단축키·게임 목록 받기 → 창 제목으로 게임 찾기 → 목록에 없는 창은 «기타»
 *  ③ 게임 목록 — 추가·고치기, «기타» 를 새 게임으로 등록하면 같은 창 스샷이 옮겨 감
 *  ④ 앨범 — 오늘·게임별 거르기, 메모, 지우기(저장통 파일도), 설정(단축키)
 *  ⑤ 글 — 연결 게임 카테고리는 안 쓴 최근 스샷 3장 · 무료 이미지 0회 · 모자라면 빈 자리 · [+ 더 넣기]
 *  ⑥ 자동 정리 — 발행 안 한 글이 쓰는 스샷은 남긴다
 */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import sharp from "sharp";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-gameshots-"));
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = path.resolve("tools/fake-claude.mjs");
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-gameplay";
process.env.GAME_AGENT_TOKEN = "agent-test-token-gameplay";
process.env.GAME_SHOT_BUCKET = `local:${path.join(임시, "shots")}`;
delete process.env.KEYSERVER_URL;
// 빈 값으로 둔다 — delete 하면 .env 의 진짜 키가 다시 읽혀 이 PC 에 따라 결과가 달라진다.
process.env.UNSPLASH_ACCESS_KEY = ""; process.env.PEXELS_API_KEY = ""; process.env.PIXABAY_API_KEY = "";
// 무료 이미지 사이트를 부르면 센다 — 게임 글은 0 이어야 한다.
let 바깥부름 = 0;
const 진짜fetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (u.startsWith("http://localhost") || u.startsWith("http://127.")) return 진짜fetch(url, init);
  바깥부름 += 1;
  return new Response("{}", { status: 503 });
}) as typeof fetch;

let 틀린것 = 0;
function 참(말: string, 값: boolean) { if (값) console.log(`   ✅ ${말}`); else { console.log(`   ❌ ${말}`); 틀린것 += 1; } }

const { getDb } = await import("../src/db/index.js");
getDb();
const R = await import("../src/db/repositories/gamePlay.js");
const C = await import("../src/db/repositories/categories.js");
const P = await import("../src/game/프로필.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");
const { 게임사진치우기 } = await import("../src/scheduler/게임사진치우기.js");
const { buildServer } = await import("../src/web/server.js");

const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-gameplay" };
const 집 = { "x-game-agent-token": "agent-test-token-gameplay" };
const 그림 = async (r: number, g: number, b: number) => (await sharp({ create: { width: 1920, height: 1080, channels: 3, background: { r, g, b } } }).png().toBuffer()).toString("base64");
const 찍기 = async (창: string, i = 0) => (await app.inject({ method: "POST", url: "/api/game/agent/shot", headers: 집, payload: { image: await 그림(i * 9 % 255, 80, 120), window_title: 창, taken_at: new Date().toISOString() } })).json();

console.log("\n① 칸막이");
const 체험 = { "x-dashboard-token": openSession({ key1: "T-GAME", key2: "T-GAME-PC", remoteToken: "r", role: "client" }) };
const 판매 = { "x-dashboard-token": openSession({ key1: "S-SALE", key2: "S-SALE-PC", remoteToken: "r", role: "admin" }) };
for (const [누구, 머리] of [["체험 키", 체험], ["판매용 접속키", 판매]] as const) {
  const 막힘 = await Promise.all([
    app.inject({ method: "GET", url: "/api/game/status", headers: 머리 }),
    app.inject({ method: "GET", url: "/api/game/games", headers: 머리 }),
    app.inject({ method: "POST", url: "/api/game/games", headers: 머리, payload: { 이름: "x" } }),
    app.inject({ method: "GET", url: "/api/game/shots", headers: 머리 }),
    app.inject({ method: "POST", url: "/api/game/shots/delete", headers: 머리, payload: { ids: [1] } }),
    app.inject({ method: "POST", url: "/api/posts/1/game-shots", headers: 머리, payload: { shot_ids: [1] } }),
  ]);
  참(`${누구}로 /api/game/* → 404`, 막힘.every((r) => r.statusCode === 404));
}
참("판매용 접속키도 글 목록은 그대로 본다(주인 자리)", (await app.inject({ method: "GET", url: "/api/queue", headers: 판매 })).statusCode === 200);
참("관리자 접속은 열림", (await app.inject({ method: "GET", url: "/api/game/games", headers: 주인 })).statusCode === 200);
참("집 PC 토큰이 틀리면 401", (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: { "x-game-agent-token": "wrong-token-123" }, payload: {} })).statusCode === 401);
참("집 PC 길에 대시보드 토큰은 안 통한다", (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: 주인, payload: {} })).statusCode === 401);
const 원래통 = process.env.GAME_SHOT_BUCKET;
delete process.env.GAME_SHOT_BUCKET;
참("저장통이 없는 서버(판매 설치본)는 관리자에게도 기능이 꺼져 있다", (await app.inject({ method: "GET", url: "/api/game/status", headers: 주인 })).statusCode === 404);
const 통없음 = await app.inject({ method: "POST", url: "/api/game/agent/shot", headers: 집, payload: {} });
참("집 PC 길은 저장통 없으면 409 needsGameBucket", 통없음.statusCode === 409 && 통없음.json().needsGameBucket === true);
process.env.GAME_SHOT_BUCKET = 원래통;

console.log("\n② 집 PC 흐름");
const 전상태 = (await app.inject({ method: "GET", url: "/api/game/status", headers: 주인 })).json();
참("하트비트 전에는 연결 안 됨", 전상태.agent.connected === false && 전상태.agentTokenSet === true);
const 하트 = (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: 집, payload: { version: "0.3.0" } })).json();
참("하트비트로 단축키(F9)·게임 목록을 받아 간다", 하트.settings.단축키 === "F9" && 하트.games.some((g: { id: string; 창제목: string }) => g.id === "dokkaebi" && g.창제목 === "도깨비의세계 -"));
const 후상태 = (await app.inject({ method: "GET", url: "/api/game/status", headers: 주인 })).json();
참("하트비트 뒤에는 연결됨 + 버전", 후상태.agent.connected === true && 후상태.agent.version === "0.3.0");
참("창 제목 찾기: 긴 글자부터, 런처 창은 안 맞음", P.창으로게임("도깨비의세계 - 26.104.005", R.게임목록())?.id === "dokkaebi" && P.창으로게임("도깨비의세계 런처", R.게임목록()) === null);
const 첫 = await 찍기("도깨비의세계 - 26.104.005", 1);
참("게임 창 스샷 → 도깨비의세계 오늘 1장", 첫.game_id === "dokkaebi" && 첫.today === 1);
const 둘 = await 찍기("ANIIMO Global", 2);
참("대소문자 상관없이 애니모", 둘.game_id === "aniimo");
const 셋 = await 찍기("MapleStory", 3);
참("목록에 없는 창 → «기타»", 셋.game_id === "etc" && 셋.game_name === "기타");
const 저장본 = R.사진읽기(첫.shot_id)!;
참("서버에는 가로 1280 으로 줄여 저장", 저장본.width === 1280 && fs.existsSync(path.join(임시, "shots", 저장본.gcs_path)));
참("마지막 스샷이 상태에 보인다", (await app.inject({ method: "GET", url: "/api/game/status", headers: 주인 })).json().lastShot?.game_name === "기타");

console.log("\n③ 게임 목록");
await 찍기("MapleStory Worlds", 4);
const 등록 = await app.inject({ method: "POST", url: "/api/game/etc/register", headers: 주인, payload: { shot_id: 셋.shot_id, 이름: "메이플스토리", 창제목: "MapleStory" } });
참("«기타» → 새 게임 등록, 같은 창 스샷 2장이 옮겨 감", 등록.statusCode === 200 && 등록.json().moved === 2 && R.사진읽기(셋.shot_id)!.game_id === 등록.json().id);
참("이제 그 창은 새 게임으로 찍힌다", (await 찍기("MapleStory", 5)).game_id === 등록.json().id);
const 추가 = await app.inject({ method: "POST", url: "/api/game/games", headers: 주인, payload: { 이름: "로스트아크", 창제목: "LOST ARK" } });
참("게임 추가", 추가.statusCode === 200 && R.게임읽기(추가.json().id)?.창제목 === "LOST ARK");
참("같은 이름은 409", (await app.inject({ method: "POST", url: "/api/game/games", headers: 주인, payload: { 이름: "로스트아크" } })).statusCode === 409);
참("이름 없으면 400", (await app.inject({ method: "POST", url: "/api/game/games", headers: 주인, payload: { 창제목: "x" } })).statusCode === 400);
await app.inject({ method: "PUT", url: `/api/game/games/${추가.json().id}`, headers: 주인, payload: { 이름: "로스트아크", 창제목: "LOSTARK" } });
참("고치기", R.게임읽기(추가.json().id)?.창제목 === "LOSTARK");
const 목록 = (await app.inject({ method: "GET", url: "/api/game/games", headers: 주인 })).json();
const 도깨비줄 = 목록.items.find((g: { id: string }) => g.id === "dokkaebi");
참("게임 목록에 장수(전체·오늘)와 «기타» 줄", 도깨비줄.shots.전체 === 1 && 도깨비줄.shots.오늘 === 1 && 목록.etc.shots.전체 === 0);

console.log("\n④ 앨범 · 설정");
for (let i = 0; i < 9; i++) await 찍기("도깨비의세계 - 26.104.005", 10 + i);
const 쪽1 = (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&day=today&page=1", headers: 주인 })).json();
const 쪽2 = (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&day=today&page=2", headers: 주인 })).json();
참(`고르기 창은 한 쪽 8장 (오늘 ${쪽1.total}장)`, 쪽1.items.length === 8 && 쪽1.total === 10 && 쪽2.items.length === 2);
참("앨범은 크게 한 쪽(size=48)", (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&day=today&size=48", headers: 주인 })).json().items.length === 10);
참("어제는 0장", (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&day=yesterday", headers: 주인 })).json().total === 0);
const 메모 = (await app.inject({ method: "PUT", url: `/api/game/shots/${첫.shot_id}`, headers: 주인, payload: { caption: "안개 기슭 입구" } })).json();
참("메모 적기", 메모.caption === "안개 기슭 입구");
const 지울 = 쪽2.items.find((s: { id: number }) => s.id !== 첫.shot_id);
const 지울경로 = R.사진읽기(지울.id)!.gcs_path;
const 지움 = (await app.inject({ method: "POST", url: "/api/game/shots/delete", headers: 주인, payload: { ids: [지울.id] } })).json();
참("지우기 — 목록에서 빠지고 저장통 파일도 지움", 지움.deleted === 1 && !fs.existsSync(path.join(임시, "shots", 지울경로))
  && (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&day=today", headers: 주인 })).json().total === 9);
const 설정 = (await app.inject({ method: "PUT", url: "/api/game/settings", headers: 주인, payload: { 단축키: "F8" } })).json();
참("단축키 바꾸기 → 하트비트로 전달", 설정.단축키 === "F8"
  && (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: 집, payload: {} })).json().settings.단축키 === "F8");
참("모르는 키는 안 받음", (await app.inject({ method: "PUT", url: "/api/game/settings", headers: 주인, payload: { 단축키: "A" } })).json().단축키 === "F8");

console.log("\n⑤ 글 — 연결 게임 카테고리");
const 바깥전 = 바깥부름;
const 카 = C.createCategory({ name: "도깨비의세계 공략", requiresSearch: false, promptHint: "도깨비의세계 게임 공략" });
C.연결게임적기(카.id, "dokkaebi");
const 일반 = await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 카.id } });
const 붙은 = R.글사진들(일반.json().id);
const 최근3 = R.사진찾기({ game: "dokkaebi", size: 3 }).items.map((s) => s.id);
참("무료 이미지 키가 0개여도 막지 않는다", 일반.statusCode === 200);
참("안 쓴 최근 스샷 3장 자동", JSON.parse(일반.json().image_paths_json || "[]").length === 3 && JSON.stringify(붙은.map((s) => s.id)) === JSON.stringify(최근3));
참("무료 이미지 검색 0회", 바깥부름 === 바깥전);
const 둘째 = (await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 카.id } })).json();
참("다음 글은 겹치지 않는 다음 3장", R.글사진들(둘째.id).every((s) => !최근3.includes(s.id)) && R.글사진들(둘째.id).length === 3);
const 더 = await app.inject({ method: "POST", url: `/api/posts/${일반.json().id}/game-shots/auto`, headers: 주인 });
참("[+ 스샷 더 넣기] → 남은 안 쓴 스샷을 뒤에", 더.statusCode === 200 && JSON.parse(더.json().image_paths_json).length === 6);
const 없음 = await app.inject({ method: "POST", url: `/api/posts/${일반.json().id}/game-shots/auto`, headers: 주인 });
참("안 쓴 스샷이 없으면 409 shortage", 없음.statusCode === 409 && 없음.json().shortage === true);
const 셋째 = (await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 카.id } })).json();
참("스샷이 모자라면 빈 자리(무료 이미지로 안 채움)", JSON.parse(셋째.image_paths_json || "[]").length === 0 && 바깥부름 === 바깥전);
const 고른 = (await app.inject({ method: "POST", url: `/api/posts/${셋째.id}/game-shots`, headers: 주인, payload: { shot_ids: [첫.shot_id], mode: "append" } })).json();
참("[🔄 바꾸기] 창에서 고른 스샷 붙이기 — 이미 다른 글에 쓴 것도 고를 수 있다", JSON.parse(고른.image_paths_json).length === 1);
const 판매로 = await app.inject({ method: "POST", url: "/api/run/generate", headers: 판매, payload: { categoryId: 카.id } });
참("판매용 접속키는 게임 연결 카테고리라도 스샷을 못 쓴다(이미지 키 없으면 예전처럼 막힘)", 판매로.statusCode === 409 && 바깥부름 === 바깥전);
참("판매용 접속키에는 포스팅 목록에 연결 게임이 안 보인다", (await app.inject({ method: "GET", url: "/api/queue", headers: 판매 })).json().items.every((p: { category_game_id: unknown }) => !p.category_game_id));
const 그냥카 = C.createCategory({ name: "생활 정보", requiresSearch: false, promptHint: "생활" });
참("연결 안 한 카테고리는 예전처럼 이미지 키 막기", (await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 그냥카.id } })).statusCode === 409);
참("게임 목록에 연결된 카테고리 이름", (await app.inject({ method: "GET", url: "/api/game/games", headers: 주인 })).json().items.find((g: { id: string }) => g.id === "dokkaebi").categories.includes("도깨비의세계 공략"));

console.log("\n⑥ 자동 정리");
const 쓴글 = 일반.json().id as number;
getDb().prepare("UPDATE posts SET status = 'published', published_at = datetime('now', '-40 days') WHERE id = ?").run(쓴글);
// 첫 스샷은 아직 발행 안 한 셋째 글에도 들어 있다 → 지우면 안 된다.
const 공유 = 첫.shot_id as number;
if (!R.글사진들(쓴글).some((s) => s.id === 공유)) R.글사진적기(쓴글, [공유], "append");
const 결과 = await 게임사진치우기(new Date());
const 쓴것 = R.글사진들(쓴글).filter((s) => s.id !== 공유);
참("발행 안 한 글이 쓰는 스샷은 남긴다", !R.사진읽기(공유)!.deleted_at);
참(`발행 후 30일 지난 글에만 쓴 스샷은 지운다 (${결과.사진}장)`, 쓴것.length >= 1 && 쓴것.every((s) => !!R.사진읽기(s.id)!.deleted_at));
참("저장통 파일도 지워졌다", 쓴것.every((s) => !fs.existsSync(path.join(임시, "shots", s.gcs_path))));

await app.close();
console.log(틀린것 ? `\n❌ ${틀린것}개 틀림` : "\n✅ 다 맞음");
process.exit(틀린것 ? 1 : 0);
