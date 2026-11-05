/**
 * **제목 패턴 다양화** 를 시험한다.
 *
 *     npx tsx tests/test-제목다양화.ts
 *
 * - 끝맺음 꼴 16종 중 이번 글의 4자리(title+variants 3개)가 서로 겹치지 않게 골라지는가
 * - 최근에 몰린 꼴은(가중 무작위라도) 거의 안 나오는가
 * - title_variants 3개의 구조(키워드 선두/후킹 선두/물음 선두)도 같이 지시되는가, title 은 그대로인가
 * - 실제로 이어 쓰면 30편 넘게 가도 한두 꼴로 쏠리지 않는가
 * 인터넷도 진짜 AI 도 필요 없다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-tdv-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (!p.includes("자료만 빠르게")) fs.writeFileSync(${JSON.stringify(기록)}, p);
const n = Date.now() % 100000;
const 글 = { keyword: "시험 키워드 조합", title: "시험 키워드 조합 알아 두면 손해 안 보는 3가지 기준",
  content: "첫 줄 " + n + " 입니다.\\n" + "오늘은 꼭 알아 두면 좋은 정보를 정리해 볼게요. ".repeat(80) + "\\n끝 문장 " + n + " 이에요.",
  image_query: "test", tags: ["#가","#나","#다","#라","#마"],
  title_variants: ["시험 키워드 조합 모르면 손해인 조건", "시험 키워드 조합 완성하는 법", "시험 키워드 조합 써 보고 느낀 점"] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-tdv";
process.env.NAVER_FAKE = "1";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const S = await import("../src/db/repositories/settings.js");
const C = await import("../src/db/repositories/categories.js");
const T = await import("../src/claude/제목다양화.js");
const { generatePost } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
const { 상태적기 } = await import("../src/ai/run.js");

getDb();
S.최소분량정하기(1000);
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 지시문 = () => fs.readFileSync(기록, "utf8");
const 끝맺음목록 = Object.keys(T.끝맺음꼴들);
const 구조목록 = Object.keys(T.제목구조들);

console.log("\n① 끝맺음 고르기 — 이번 글 안에서 4개가 서로 겹치지 않는다");
for (let i = 0; i < 50; i++) {
  const 선택 = T.끝맺음고르기({ endings: [], structures: [] });
  const 넷 = [선택.main, ...선택.variants];
  if (new Set(넷).size !== 4 || !넷.every((k) => 끝맺음목록.includes(k))) { 틀린것 += 1; console.log("   ❌ 겹치거나 모르는 꼴:", 넷); break; }
  if (선택.구조.length !== 3 || !선택.구조.every((s) => 구조목록.includes(s))) { 틀린것 += 1; console.log("   ❌ 구조가 이상함:", 선택.구조); break; }
}
console.log(`   ✅ 50번 모두 4개가 서로 다르고(끝맺음 16종 중), 구조 3개도 알려진 값이다`);

console.log("\n② 최근에 많이 쓴 꼴일수록 (가중 무작위라도) 덜 나온다");
const 최근몰림 = (Array(40).fill("count").concat(Array(15).fill("method"))) as ("count" | "method")[];
let count나옴 = 0; let method나옴 = 0; let 신선한것나옴 = 0;
for (let i = 0; i < 300; i++) {
  const 선택 = T.끝맺음고르기({ endings: 최근몰림, structures: [] });
  const 넷 = [선택.main, ...선택.variants];
  if (넷.includes("count")) count나옴++;
  if (넷.includes("method")) method나옴++;
  if (넷.includes("reason")) 신선한것나옴++; // 최근에 한 번도 안 쓴 꼴
}
참(`최근 40번 몰린 «count» 가 15번 몰린 «method» 보다 덜 나온다 (count ${count나옴}번 < method ${method나옴}번, 300번 중)`, count나옴 < method나옴);
참(`아예 안 쓴 «reason» 이 둘보다 더 자주 나온다 (reason ${신선한것나옴}번)`, 신선한것나옴 > method나옴 && 신선한것나옴 > count나옴);
참("그래도 완전히 0번은 아니다(결정론적 금지가 아니라 가중 무작위라서)", count나옴 > 0);

console.log("\n③ 지시문 블록 — 끝맺음 넷 + title_variants 구조 셋을 각각 지정해 준다");
const 블록선택 = T.끝맺음고르기({ endings: [], structures: [] });
const 블록글 = T.끝맺음블록(블록선택);
참("제목 패턴 다양화 머리말", 블록글.includes("[제목 패턴 다양화"));
참("title 끝맺음 꼴", 블록글.includes(`title (본 제목): ${T.끝맺음꼴들[블록선택.main].꼴}`));
참("title_variants[0] 끝맺음 꼴", 블록글.includes(T.끝맺음꼴들[블록선택.variants[0]].꼴));
참("title_variants[2] 끝맺음 꼴", 블록글.includes(T.끝맺음꼴들[블록선택.variants[2]].꼴));
참("title 은 키워드 선두를 그대로 지키라고 — 구조는 안 흔든다", 블록글.includes("title 은 반드시 [앞머리 키워드 조합]으로 시작해야 하는 지금 규칙을 그대로 지켜라"));
참("title_variants[0] 구조", 블록글.includes(`title_variants[0]: ${T.제목구조들[블록선택.구조[0]]}`));
참("title_variants[1] 구조", 블록글.includes(`title_variants[1]: ${T.제목구조들[블록선택.구조[1]]}`));
참("변형도 핵심 키워드는 자연스럽게 넣으라고(SEO 최소 보장)", 블록글.includes("핵심 키워드는 문장 어딘가에는 자연스럽게 꼭 들어가야 한다"));

console.log("\n④ 실제로 글을 이어 쓰면 — 프롬프트에 들어가고, variation_json 에 남아 다음 글이 참고한다");
상태적기(true, "", "claude");
const 카 = C.createCategory({ name: "시험다양화", requiresSearch: false, promptHint: "시험" });
const 아이디들: number[] = [];
for (let i = 0; i < 20; i++) {
  const post = await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
  아이디들.push(post.id);
  if (i === 0) 참("첫 글의 프롬프트에 [제목 패턴 다양화] 블록", 지시문().includes("[제목 패턴 다양화"));
}
const 기록들 = 아이디들.map((id) =>
  JSON.parse((getDb().prepare("SELECT variation_json FROM posts WHERE id = ?").get(id) as any).variation_json));
참("글마다 titlePatterns 4개 + titleStructures 3개를 남긴다",
  기록들.every((v) => Array.isArray(v.titlePatterns) && v.titlePatterns.length === 4 && Array.isArray(v.titleStructures) && v.titleStructures.length === 3));
참("한 글 안에서 끝맺음 4개는 서로 겹치지 않는다", 기록들.every((v) => new Set(v.titlePatterns).size === 4));
const 본제목꼴들 = 기록들.map((v) => v.titlePatterns[0]);
const 쓰인것들 = new Set(본제목꼴들);
참(`20편을 쓰는 동안 본 제목 끝맺음이 한두 가지로 몰리지 않는다 (쓰인 꼴 ${쓰인것들.size}가지: ${[...쓰인것들].join(", ")})`, 쓰인것들.size >= 6);
const 최대몫 = Math.max(...[...쓰인것들].map((k) => 본제목꼴들.filter((x) => x === k).length));
참(`한 꼴이 20편 중 1/3을 넘게 차지하지 않는다 (최대 ${최대몫}번)`, 최대몫 <= 7);
const 쓰인구조들 = new Set(기록들.flatMap((v) => v.titleStructures));
참(`구조 3종(키워드/후킹/물음 선두)이 다 돌아 쓰인다 (${[...쓰인구조들].join(", ")})`, 쓰인구조들.size === 3);

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
