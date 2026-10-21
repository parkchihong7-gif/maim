/**
 * **🕹️ 게임 플레이** 를 한 번에 시험한다 (GAME_PLAN 10번 — 가짜 AI 로 돈다).
 *
 *     npx tsx tests/test-게임플레이.ts
 *
 *  ① 판단 답 모양 — 틀리면 «대기»     ② 안전 — 금지 화면 정지·기록 모드 입력 0·화이트리스트·로그인 정지
 *  ③ 사진 체크리스트·게임 목록 순서   ④ 칸막이 — 체험·**판매용** 키 404, 집 PC 토큰 틀리면 401, 저장통 없으면 기능 꺼짐
 *  ⑤ 집 PC 흐름 — 하트비트 start → 판단 → 사진 → 퀘스트 완료 → 미션 목표 → stop
 *  ⑥ 공략 글 — 내 캡처만, 무료 이미지 검색 0회     ⑦ 일반 글(연결 게임) — 캡처 3장·무료 이미지 0회·부족하면 빈 자리
 *  ⑧ 고르기 창 8장씩 · 참고 글(로그인 필요 주소 못읽음)  ⑨ 자동 정리 — 발행 안 한 글이 쓰는 캡처는 남긴다
 */
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import sharp from "sharp";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-gameplay-"));
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = path.resolve("tools/fake-claude.mjs");
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-gameplay";
process.env.GAME_AGENT_TOKEN = "agent-test-token-gameplay";
process.env.GAME_SHOT_BUCKET = `local:${path.join(임시, "shots")}`;
delete process.env.KEYSERVER_URL;
delete process.env.UNSPLASH_ACCESS_KEY; delete process.env.PEXELS_API_KEY; delete process.env.PIXABAY_API_KEY;
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
const 판 = await import("../src/game/판단.js");
const 미 = await import("../src/game/미션.js");
const 목 = await import("../src/game/목록.js");
const 참고 = await import("../src/game/참고글.js");
const R = await import("../src/db/repositories/gamePlay.js");
const C = await import("../src/db/repositories/categories.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");
const { 게임사진치우기 } = await import("../src/scheduler/게임사진치우기.js");
const { buildServer } = await import("../src/web/server.js");

const 감독 = R.프로필읽기("dokkaebi")!;
const 기록 = R.프로필읽기("aniimo")!;

console.log("\n① 판단 답 모양");
참("JSON 아님 → 대기", 판.판단읽기("모르겠어요").행동 === "대기");
참("모르는 장면 → 대기", 판.판단읽기(JSON.stringify({ 장면: "춤", 행동: "자동진행" })).행동 === "대기");
const 바른 = 판.판단읽기(JSON.stringify({ 장면: "퀘스트받음", 퀘스트: { 이름: "장터의 소문", 종류: "메인", 단계: "시작" }, 남김: true, 설명: "의뢰", 행동: "임무수락", 이유: "-" }));
참("바른 답은 그대로", 바른.장면 === "퀘스트받음" && 바른.퀘스트?.이름 === "장터의 소문" && 바른.남김);

console.log("\n② 안전 거르기");
참("금지 화면 단어 → 정지", 판.안전거르기({ ...바른, 보이는글: "상점, 구매" }, 감독).행동 === "정지");
참("기록 모드 → 버튼 행동은 대기", 판.안전거르기({ ...바른, 행동: "임무수락" }, 기록).행동 === "대기");
참("기록 모드라도 금지 화면이면 정지", 판.안전거르기({ ...바른, 보이는글: "결제" }, { ...기록, 금지화면: ["결제"] }).행동 === "정지");
참("감독 모드 · 목록에 없는 버튼 → 대기", 판.안전거르기({ ...바른, 행동: "공격" }, 감독).행동 === "대기");
참("감독 모드 · 목록에 있는 버튼 → 그대로", 판.안전거르기({ ...바른, 행동: "자동진행" }, 감독).행동 === "자동진행");
참("로그인 화면 → 정지 + 로그인필요", (() => { const r = 판.안전거르기({ ...바른, 장면: "로그인" }, 감독); return r.행동 === "정지" && r.멈춤상태 === "로그인필요"; })());
참("경고 화면 → 정지 + 확인필요", 판.안전거르기({ ...바른, 장면: "경고" }, 감독).멈춤상태 === "확인필요");
const 고친 = R.프로필저장("dokkaebi", { ...감독, 버튼: { ...감독.버튼, 상점열기: { x: 0.5, y: 0.5 } } })!;
참("프로필에 «상점열기» 버튼을 넣어도 저장 때 버린다", !("상점열기" in 고친.버튼) && "자동진행" in 고친.버튼);
참("기록 모드로 바꾸면 버튼이 비워진다", Object.keys(R.프로필저장("aniimo", { ...기록, 버튼: { 자동진행: { 키: "J" } } })!.버튼).length === 0);

console.log("\n③ 체크리스트 · 목록 순서");
const 메인칸 = 미.칸들(null, "메인");
참("메인 기본 틀 7칸(중간 지점 2장)", 메인칸.length === 7 && 메인칸.find((c) => c.키 === "중간")?.개수 === 2);
const 채움 = 미.채우기(메인칸, ["퀘스트받음", "지도", "이동중", "보스처치", "보상"]);
참("보스 처치 한 장은 한 칸만 채운다", 채움.찬 === 5 && !채움.다참);
참("빠진 장면: 중간 지점·도착·대화", JSON.stringify(미.빠진것(채움.칸)) === JSON.stringify(["중간 지점", "도착", "대화"]));
const 줄 = 목.목록읽기(JSON.stringify({ 목록: [{ 이름: "붉은 ■■의 …", 종류: "메인", 상태: "진행가능", 확신: 0.9 }, { 이름: "흐린 줄", 종류: "서브", 상태: "진행가능", 확신: 0.5 }] }));
참("잘린 이름·확신 낮음 → 확인필요", 줄.every((r) => r.상태 === "확인필요"));
const 값 = (상태: string, 종류: string, 조건: string, 게임순서: number) => 목.정렬값({ 상태, 종류, 조건, 게임순서 });
참("진행중 < 진행가능(메인) < 진행가능(서브) < 조건미달 < 확인필요 < 완료",
  값("진행중", "서브", "", 9) < 값("진행가능", "메인", "", 5) && 값("진행가능", "메인", "", 5) < 값("진행가능", "서브", "", 1)
  && 값("진행가능", "기타", "", 9) < 값("조건미달", "메인", "레벨 10", 1) && 값("조건미달", "메인", "레벨 90", 1) < 값("확인필요", "메인", "", 1)
  && 값("확인필요", "메인", "", 1) < 값("완료", "메인", "", 1));
참("조건미달은 레벨 낮은 것부터", 값("조건미달", "서브", "레벨 20 필요", 9) < 값("조건미달", "메인", "레벨 30 필요", 1));

console.log("\n④ 칸막이");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-gameplay" };
const 집 = { "x-game-agent-token": "agent-test-token-gameplay" };
const 체험 = { "x-dashboard-token": openSession({ key1: "T-GAME", key2: "T-GAME-PC", remoteToken: "r", role: "client" }) };
const 막힌것 = await Promise.all([
  app.inject({ method: "GET", url: "/api/game/status", headers: 체험 }),
  app.inject({ method: "POST", url: "/api/game/start", headers: 체험, payload: { game: "dokkaebi" } }),
  app.inject({ method: "GET", url: "/api/game/shots", headers: 체험 }),
  app.inject({ method: "GET", url: "/api/posts/1/game-shots", headers: 체험 }),
]);
참("체험 키로 /api/game/* → 404", 막힌것.every((r) => r.statusCode === 404));
// 판매용 접속키(키 서버 role admin) — 글·카테고리는 주인과 같은 자리지만 게임 플레이는 관리자 접속만.
const 판매 = { "x-dashboard-token": openSession({ key1: "S-SALE", key2: "S-SALE-PC", remoteToken: "r", role: "admin" }) };
const 판매막힘 = await Promise.all([
  app.inject({ method: "GET", url: "/api/game/status", headers: 판매 }),
  app.inject({ method: "GET", url: "/api/game/profiles", headers: 판매 }),
  app.inject({ method: "POST", url: "/api/game/start", headers: 판매, payload: { game: "dokkaebi" } }),
  app.inject({ method: "POST", url: "/api/game/stop", headers: 판매 }),
  app.inject({ method: "GET", url: "/api/game/shots", headers: 판매 }),
  app.inject({ method: "POST", url: "/api/posts/1/game-shots", headers: 판매, payload: { shot_ids: [1] } }),
]);
참("판매용 접속키로 /api/game/* → 404", 판매막힘.every((r) => r.statusCode === 404));
참("판매용 접속키도 글 목록은 그대로 본다(주인 자리)", (await app.inject({ method: "GET", url: "/api/queue", headers: 판매 })).statusCode === 200);
참("관리자 접속은 열림", (await app.inject({ method: "GET", url: "/api/game/profiles", headers: 주인 })).statusCode === 200);
참("집 PC 토큰이 틀리면 401", (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: { "x-game-agent-token": "wrong-token-123" }, payload: {} })).statusCode === 401);
참("집 PC 길에 대시보드 토큰은 안 통한다", (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: 주인, payload: {} })).statusCode === 401);
const 원래통 = process.env.GAME_SHOT_BUCKET;
delete process.env.GAME_SHOT_BUCKET;
참("저장통이 없는 서버(판매 설치본)는 관리자에게도 기능이 꺼져 있다", (await app.inject({ method: "GET", url: "/api/game/status", headers: 주인 })).statusCode === 404);
const 통없음 = await app.inject({ method: "POST", url: "/api/game/agent/shot", headers: 집, payload: {} });
참("집 PC 길은 저장통 없으면 409 needsGameBucket", 통없음.statusCode === 409 && 통없음.json().needsGameBucket === true);
process.env.GAME_SHOT_BUCKET = 원래통;

console.log("\n⑤ 집 PC 흐름 (가상 힌트)");
const 그림 = async (r: number, g: number, b: number) => (await sharp({ create: { width: 1280, height: 720, channels: 3, background: { r, g, b } } }).png().toBuffer()).toString("base64");
const 하트 = async (state: string) => (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: 집, payload: { version: "t", game: "dokkaebi", state } })).json();
const 미션 = (await app.inject({ method: "POST", url: "/api/game/missions", headers: 주인, payload: { game_id: "dokkaebi", title: "메인 1개", targets: [{ 종류: "메인", 개수: 1 }], checklist: [{ 키: "받음" }, { 키: "지도" }, { 키: "보상" }] } })).json();
참("미션 저장", 미션.목표수 === 1);
await app.inject({ method: "POST", url: "/api/game/start", headers: 주인, payload: { game: "dokkaebi", mission_id: 미션.id } });
const 첫 = await 하트("대기");
참("하트비트로 start 명령 + 프로필을 받아 간다", 첫.command?.명령 === "start" && 첫.command?.profile?.id === "dokkaebi" && !!첫.session_id);
참("두 번 주지 않는다", (await 하트("진행중")).command === null);
const q이름 = { 이름: "장터의 소문", 종류: "메인", 단계: "진행" };
const 장면들 = [["퀘스트받음", "임무수락"], ["지도", "창닫기"], ["보상", "보상받기"], ["퀘스트완료", "다음퀘스트"]] as const;
let 퀘스트id = 0;
for (const [i, [장면, 행동]] of 장면들.entries()) {
  const 판단 = (await app.inject({ method: "POST", url: "/api/game/agent/judge", headers: 집,
    payload: { game: "dokkaebi", image: await 그림(40 * i, 80, 120), 상황: { 가상힌트: { 장면, 퀘스트: q이름, 행동, 설명: `${장면} 장면` } } } })).json();
  퀘스트id = 판단.quest_id;
  if (판단.남김) await app.inject({ method: "POST", url: "/api/game/agent/shot", headers: 집, payload: { game: "dokkaebi", image: await 그림(40 * i, 80, 120), scene: 장면, caption: 판단.설명, quest_id: 퀘스트id } });
}
const q = R.퀘스트읽기(퀘스트id)!;
참("퀘스트가 생기고 완료됐다", q.status === "완료" && !!q.done_at);
참("미션 체크리스트(받음·지도·보상)가 다 찼다", R.진행표(q).다참);
const 끝 = await 하트("진행중");
참("미션 목표를 채우면 서버가 stop 을 건다", 끝.command?.명령 === "stop");
await 하트("대기");
참("집 PC 가 대기로 돌아오면 세션이 닫힌다", R.열린세션() === null);
참("미션 상태 «준비됨»", R.미션읽기(미션.id)!.status === "준비됨");
const 금지판단 = (await app.inject({ method: "POST", url: "/api/game/agent/judge", headers: 집, payload: { game: "dokkaebi", image: await 그림(1, 2, 3), 상황: { 가상힌트: { 장면: "팝업", 행동: "자동진행", 보이는글: "상점, 결제" } } } })).json();
참("서버를 거친 판단도 금지 화면이면 정지", 금지판단.행동 === "정지" && 금지판단.멈춤상태 === "금지화면");
await app.inject({ method: "POST", url: "/api/game/agent/event", headers: 집, payload: { game: "dokkaebi", kind: "막힘", detail: { quest_id: (R.퀘스트찾거나만들기("dokkaebi", "잃어버린 장부", "서브")).퀘스트.id, 이유: "같은 장면 5분 이상" } } });
참("막힘 이벤트 → 직접 플레이 대기", R.퀘스트목록("dokkaebi", "직접플레이대기").length === 1);

console.log("\n⑤-2 대시보드 토큰 · 집 PC 프로필 올리기");
const 새것 = (await app.inject({ method: "POST", url: "/api/game/agent-token/new", headers: 주인 })).json();
참("대시보드에서 만든 토큰으로도 집 PC 가 붙는다", (await app.inject({ method: "POST", url: "/api/game/agent/heartbeat", headers: { "x-game-agent-token": 새것.token }, payload: { state: "대기" } })).statusCode === 200);
참("판매용 키는 토큰을 못 본다", (await app.inject({ method: "GET", url: "/api/game/agent-token", headers: 판매 })).statusCode === 404);
const 올림 = (await app.inject({ method: "PUT", url: "/api/game/agent/profile/dokkaebi", headers: 집,
  payload: { 창제목: "도깨비의 세계", 실행: { 파일: "C:\\Games\\D.exe" }, 영역: { 미니맵: { x: 0.8, y: 0, w: 0.2, h: 0.2 } }, 버튼: { 상점열기: { x: 0.1, y: 0.1 } }, 모드: "기록" } })).json();
참("집 PC 는 창제목·실행 파일·영역만 바꾼다(버튼·모드는 그대로)", 올림.창제목 === "도깨비의 세계" && 올림.실행.파일 === "C:\\Games\\D.exe"
  && 올림.영역.미니맵.x === 0.8 && 올림.모드 === "감독" && !("상점열기" in 올림.버튼) && "자동진행" in 올림.버튼);

console.log("\n⑥ 공략 글");
const 바깥전 = 바깥부름;
const 글 = (await app.inject({ method: "POST", url: `/api/game/quests/${퀘스트id}/post`, headers: 주인, payload: { refs: false } })).json();
참(`공략 글이 posts 에 들어갔다 («${글.title}»)`, 글.source === "game" && 글.game_quest_id === 퀘스트id && 글.status === "ready");
const 퀘스트사진수 = R.퀘스트사진들(R.퀘스트읽기(퀘스트id)!, false).length;
참(`그 퀘스트 앨범 사진이 전부 붙었다 (${퀘스트사진수}장)`, 퀘스트사진수 >= 3 && JSON.parse(글.image_paths_json).length === 퀘스트사진수);
참("본문에 [사진 N] 자리", /\[사진 1\]/.test(글.content));
참("무료 이미지 검색 0회", 바깥부름 === 바깥전);
참("퀘스트는 글완료", R.퀘스트읽기(퀘스트id)!.status === "글완료");

console.log("\n⑦ 일반 글 — 연결 게임 카테고리");
const 카 = C.createCategory({ name: "도깨비의세계 소식", requiresSearch: false, promptHint: "도깨비의세계 게임 소식" });
C.연결게임적기(카.id, "dokkaebi");
const 일반 = await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 카.id } });
참("무료 이미지 키가 0개여도 막지 않는다", 일반.statusCode === 200);
참("캡처 3장 자동 선택", JSON.parse(일반.json().image_paths_json || "[]").length === 3);
참("무료 이미지 검색 0회", 바깥부름 === 바깥전);
getDb().prepare("UPDATE game_shots SET removed = 1").run();
const 부족 = (await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 카.id } })).json();
참("캡처가 없으면 빈 자리(무료 이미지로 안 채움)", JSON.parse(부족.image_paths_json || "[]").length === 0 && 바깥부름 === 바깥전);
getDb().prepare("UPDATE game_shots SET removed = 0").run();
const 판매로 = await app.inject({ method: "POST", url: "/api/run/generate", headers: 판매, payload: { categoryId: 카.id } });
참("판매용 접속키는 게임 연결 카테고리라도 내 캡처를 못 쓴다(이미지 키 없으면 예전처럼 막힘)", 판매로.statusCode === 409 && 바깥부름 === 바깥전);
참("판매용 접속키에는 포스팅 목록에 연결 게임이 안 보인다", (await app.inject({ method: "GET", url: "/api/queue", headers: 판매 })).json().items.every((p: { category_game_id: unknown }) => !p.category_game_id));
await app.inject({ method: "PUT", url: `/api/categories/${카.id}`, headers: 판매, payload: { gameId: null } });
참("판매용 접속키는 연결 게임을 바꾸지 못한다", C.getCategory(카.id)!.game_id === "dokkaebi");
const 그냥카 = C.createCategory({ name: "생활 정보", requiresSearch: false, promptHint: "생활" });
참("연결 안 한 카테고리는 예전처럼 이미지 키 막기", (await app.inject({ method: "POST", url: "/api/run/generate", headers: 주인, payload: { categoryId: 그냥카.id } })).statusCode === 409);

console.log("\n⑧ 고르기 창 · 참고 글");
for (let i = 0; i < 10; i++) {
  await app.inject({ method: "POST", url: "/api/game/upload", headers: 주인, payload: { game: "dokkaebi", image: await 그림(i * 20, 10, 10), scene: "이동중", caption: `길 ${i}` } });
}
const 쪽1 = (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&page=1", headers: 주인 })).json();
const 쪽2 = (await app.inject({ method: "GET", url: "/api/game/shots?game=dokkaebi&page=2", headers: 주인 })).json();
참(`한 쪽 8장 (전체 ${쪽1.total}, ${쪽1.pages}쪽)`, 쪽1.items.length === 8 && 쪽1.pages === Math.ceil(쪽1.total / 8) && 쪽2.items[0].id !== 쪽1.items[0].id);
참("목록 근거 사진은 고르기 창에 안 나온다", 쪽1.items.every((s: { source: string }) => s.source !== "list"));
const 넣기 = (await app.inject({ method: "POST", url: `/api/posts/${일반.json().id}/game-shots`, headers: 주인, payload: { shot_ids: [쪽2.items[0].id], mode: "append" } })).json();
참("고른 캡처를 뒤에 더한다", JSON.parse(넣기.image_paths_json).length === 4);
const 주소 = 참고.주소다듬기([{ url: "https://cafe.naver.com/x/1" }, { url: "https://www.youtube.com/watch?v=a" }, { url: "https://www.inven.co.kr/board/1" }, { url: "javascript:alert(1)" }]);
참("카페·유튜브는 못읽음, 인벤은 안읽음, 이상한 주소는 버림", 주소.length === 3 && 주소[0].state === "못읽음" && 주소[1].state === "못읽음" && 주소[2].kind === "인벤" && 주소[2].state === "안읽음");
const 찾기 = (await app.inject({ method: "POST", url: `/api/game/quests/${퀘스트id}/refs/search`, headers: 주인 })).json();
참("🔎 찾아 넣기 — 인벤이 먼저", 찾기.items[0]?.kind === "인벤");

console.log("\n⑨ 자동 정리");
const 쓴글 = 일반.json().id as number;
getDb().prepare("UPDATE posts SET status = 'published', published_at = datetime('now', '-40 days') WHERE id = ?").run(쓴글);
const 공유사진 = R.글사진들(쓴글)[0].id;
// 같은 캡처를 아직 발행 안 한 글에도 쓴다 → 지우면 안 된다.
R.글사진적기(부족.id, [공유사진], "append");
const 결과 = await 게임사진치우기(new Date());
참("발행 안 한 글이 쓰는 캡처는 남긴다", !R.사진읽기(공유사진)!.deleted_at);
// 일반 글 캡처 중 퀘스트 공략 글(아직 발행 안 함)에도 들어간 것은 남고, 그 글에만 쓴 것(직접 올린 사진)은 지운다.
const 쓴것 = R.글사진들(쓴글);
const 남을것 = 쓴것.filter((s) => s.id === 공유사진 || s.quest_id === 퀘스트id);
const 지울것 = 쓴것.filter((s) => !남을것.includes(s));
참("미발행 공략 글이 쓰는 퀘스트 캡처도 남긴다", 남을것.every((s) => !R.사진읽기(s.id)!.deleted_at));
참(`발행 후 30일 지난 글에만 쓴 캡처는 지운다 (${결과.사진}장)`, 지울것.length >= 1 && 지울것.every((s) => !!R.사진읽기(s.id)!.deleted_at));
참("저장통 파일도 지워졌다", 지울것.every((s) => !fs.existsSync(path.join(임시, "shots", s.gcs_path))));

await app.close();
console.log(틀린것 ? `\n❌ ${틀린것}개 틀림` : "\n✅ 다 맞음");
process.exit(틀린것 ? 1 : 0);
