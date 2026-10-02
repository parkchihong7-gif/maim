/**
 * **A. 글 쓰는 방식(카테고리 ⑦) · B. 최종 검수** 를 시험한다.
 *
 *     npx tsx tests/test-글방식검수.ts
 *
 * 인터넷도 진짜 AI 도 필요 없다. 가짜 AI 가 받은 지시문을 파일에 적고,
 * 글쓰기에는 정해진 글을, 검수 요청에는 정해진 지적 4개를 돌려준다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-ws-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (p.includes("[검수 요청]")) {
  fs.writeFileSync(${JSON.stringify(기록)}, p);
  process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify({ summary: "숫자 확인 필요", items: [
    { kind: "fact", quote: "40% 늘었다", why: "근거 없음", fix: "출처" },
    { kind: "fact", quote: "2025년 기준", why: "낡음", fix: "연도 확인" },
    { kind: "experience", quote: "제가 직접", why: "AI 경험", fix: "고치기" },
    { kind: "모르는종류", quote: "x", why: "y", fix: "z" } ] }) }));
  process.exit(0);
}
if (!p.includes("자료만 빠르게")) fs.writeFileSync(${JSON.stringify(기록)}, p);
const 글 = { keyword: "시험 키워드 조합", title: "시험 키워드 조합 알아 두면 손해 안 보는 3가지 기준",
  content: "가짜 본문입니다. ".repeat(260), image_query: "test", tags: ["#가","#나","#다","#라","#마"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-ws";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const S = await import("../src/db/repositories/settings.js");
const C = await import("../src/db/repositories/categories.js");
const W = await import("../src/claude/글방식.js");
const R = await import("../src/pipeline/최종검수.js");
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

console.log("\n① 값 다듬기 — 모르는 값은 «자동»(null)");
const d = W.글방식다듬기({ writeMode: "experience", structure: "4", lengthPref: "long", toneStrength: 100, myNote: "  내 경험  " });
참("올바른 값은 그대로", d.write_mode === "experience" && d.structure === "4" && d.length_pref === "long" && d.tone_strength === 100 && d.my_note === "내 경험");
const 나쁨 = W.글방식다듬기({ writeMode: "해킹", structure: "11", lengthPref: "huge", toneStrength: 33, myNote: "" });
참("모르는 값은 null", 나쁨.write_mode === null && 나쁨.structure === null && 나쁨.length_pref === null && 나쁨.tone_strength === null && 나쁨.my_note === null);
참("structure «auto» 는 받는다", W.글방식다듬기({ structure: "auto" }).structure === "auto");
참("아무것도 안 고르면 작성 관점만", W.글방식블록({}).startsWith("[작성 관점") && !W.글방식블록({}).includes("[글 쓰는 방식"));

console.log("\n② 아무것도 안 고른 카테고리 — 예전과 같고 작성 관점만 더해진다");
const 기본 = C.createCategory({ name: "기본 카테고리", requiresSearch: false, promptHint: "기본" });
await generatePost(C.getCategory(기본.id)!, assignDirectives(1)[0]);
const 기본지시 = 지시문();
참("작성 관점 5가지가 들어 있다", ["개인화", "차별화", "SEO", "GEO", "반복 점검"].every((k) => 기본지시.includes(k)));
참("[글 쓰는 방식] 블록은 없다", !기본지시.includes("[글 쓰는 방식"));

console.log("\n③ 고른 카테고리 — 모드·구성·분량·말투·내 경험이 지시문에");
const 고름 = C.createCategory({ name: "고른 카테고리", requiresSearch: false, promptHint: "고름" });
C.글방식적기(고름.id, W.글방식다듬기({ writeMode: "experience", structure: "1", lengthPref: "short", toneStrength: 0, myNote: "지난달 직접 계약해 봄" }));
await generatePost(C.getCategory(고름.id)!, assignDirectives(1)[0]);
const 고른지시 = 지시문();
참("작성 모드: 지식 기반 후기·경험형", 고른지시.includes("지식 기반 후기·경험형") && 고른지시.includes("실제로 겪었다고 단정하지 말고"));
참("글 구성: 1. 결론 먼저형 + 전개 예", 고른지시.includes("1. 결론 먼저형") && 고른지시.includes("전개 예"));
참("분량: 짧게 → 1800자 안팎", 고른지시.includes("1800자 안팎"));
참("말투 강도 0%", 고른지시.includes("말투 강도 0%"));
참("내 경험이 들어가고 «지어내지 마라»", 고른지시.includes("지난달 직접 계약해 봄") && 고른지시.includes("지어내지 마라"));

console.log("\n④ 화면 API — 카테고리 저장 · 검수 · 최종본");
상태적기(true, "", "claude");
const app = await buildServer();
const 주인 = { "x-dashboard-token": "owner-test-token-ws" };
const 새카 = (await app.inject({ method: "POST", url: "/api/categories", headers: 주인,
  payload: { name: "폼 카테고리", requiresSearch: true, promptHint: "폼", structure: "auto", toneStrength: 50, myNote: "메모" } })).json();
const 읽은 = C.getCategory(새카.id)!;
참("POST 로 ⑦ 값이 저장된다", 읽은.structure === "auto" && 읽은.tone_strength === 50 && 읽은.my_note === "메모");
await app.inject({ method: "PUT", url: `/api/categories/${새카.id}`, headers: 주인, payload: { structure: null, toneStrength: null } });
참("PUT 으로 «자동» 으로 되돌린다", C.getCategory(새카.id)!.structure === null && C.getCategory(새카.id)!.tone_strength === null);
await app.inject({ method: "PUT", url: `/api/categories/${새카.id}`, headers: 주인, payload: { name: "이름만 바꿈" } });
참("다른 칸만 고쳐도 ⑦ 의 메모는 그대로", C.getCategory(새카.id)!.my_note === "메모");

const 글 = await generatePost(C.getCategory(기본.id)!, assignDirectives(1)[0]);
const 원본 = 글.content;
const 검수 = await app.inject({ method: "POST", url: `/api/posts/${글.id}/review`, headers: 주인, payload: { content: "고친 글입니다. ".repeat(20) + "40% 늘었다" } });
const 검수답 = 검수.json();
참(`검수가 돈다 (${검수.statusCode})`, 검수.statusCode === 200);
참("사실 2 · 경험 1 · 모르는 종류는 버림", 검수답.counts.fact === 2 && 검수답.counts.experience === 1 && 검수답.items.length === 3);
참("검수는 «고친 글» 을 본다", 지시문().includes("고친 글입니다") && 지시문().includes("[검수 요청]"));
참("검수 횟수 1", 검수답.reviewCount === 1);

const 미확인저장 = await app.inject({ method: "POST", url: `/api/posts/${글.id}/final`, headers: 주인, payload: { content: "최종본 ".repeat(20) } });
참("«직접 확인했습니다» 없이 최종본 저장은 400", 미확인저장.statusCode === 400);
const 저장 = await app.inject({ method: "POST", url: `/api/posts/${글.id}/final`, headers: 주인, payload: { content: "최종본 ".repeat(20), confirmed: true } });
참("확인하고 저장하면 200", 저장.statusCode === 200 && !!저장.json().finalAt);
const 큐 = (await app.inject({ method: "GET", url: "/api/queue", headers: 주인 })).json();
const 큐글 = (큐.items || 큐).find((x: any) => x.id === 글.id);
참("원래 초안은 그대로, 최종본은 따로", 큐글 && 큐글.content === 원본 && 큐글.final_content.startsWith("최종본"));

console.log("\n⑤ 체험 키 — AI 검수는 하루 5번까지");
const 체험 = { "x-dashboard-token": openSession({ key1: "T-WS", key2: "T-WS-PC", remoteToken: "r", role: "client" }) };
const 체험카 = (await app.inject({ method: "POST", url: "/api/categories", headers: 체험, payload: { name: "체험", requiresSearch: true, promptHint: "체험" } })).json();
const { 자리에서 } = await import("../src/tenancy.js");
const 체험글 = await 자리에서({ ownerKey: "T-WS", role: "client" }, () => generatePost(C.getCategory(체험카.id)!, assignDirectives(1)[0]));
const 코드들: number[] = [];
for (let i = 0; i < 6; i++) {
  코드들.push((await app.inject({ method: "POST", url: `/api/posts/${체험글.id}/review`, headers: 체험, payload: {} })).statusCode);
}
참(`5번은 되고 6번째는 429 (${코드들.join(",")})`, 코드들.slice(0, 5).every((c) => c === 200) && 코드들[5] === 429);
참("주인 글은 체험 키로 검수할 수 없다(404)",
  (await app.inject({ method: "POST", url: `/api/posts/${글.id}/review`, headers: 체험, payload: {} })).statusCode === 404);
await app.close();

console.log("\n⑥ 검수 답 읽기 — 엉성한 답도 견딘다");
const 엉성 = R.검수답읽기("```json\n{\"items\":[{\"kind\":\"exaggeration\",\"quote\":\"100%\"}]}\n```");
참("코드펜스를 걷고 읽는다", 엉성.counts.exaggeration === 1 && 엉성.items[0].why === "");

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
