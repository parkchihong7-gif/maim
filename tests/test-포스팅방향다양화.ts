/**
 * **포스팅 방향 다양화**(프리셋 10종+랜덤, 프리셋별 문구 변주) 와
 * **글 구성 "자동"의 코드 선택** 을 시험한다.
 *
 *     npx tsx tests/test-포스팅방향다양화.ts
 *
 * 인터넷도 진짜 AI 도 필요 없다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-dir-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (!p.includes("자료만 빠르게")) fs.writeFileSync(${JSON.stringify(기록)}, p);
const n = Date.now() % 100000;
const 글 = { keyword: "시험 키워드 조합", title: "시험 키워드 조합 알아 두면 손해 안 보는 기준",
  content: "첫 줄 " + n + " 입니다.\\n" + "오늘은 꼭 알아 두면 좋은 정보를 정리해 볼게요. ".repeat(80) + "\\n끝 문장 " + n + " 이에요.",
  image_query: "test", tags: ["#가","#나","#다","#라","#마"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
process.env.DASHBOARD_TOKEN = "owner-test-token-dir";
process.env.NAVER_FAKE = "1";
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const S = await import("../src/db/repositories/settings.js");
const C = await import("../src/db/repositories/categories.js");
const B = await import("../src/claude/blogProfile.js");
const D = await import("../src/claude/포스팅방향다양화.js");
const W = await import("../src/claude/글방식.js");
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
console.log("\n① 프리셋 10종 + 랜덤 = 11개가 등록돼 있다");
const 전체 = S.getAllPostingDirectionPresets();
const 내장 = 전체.filter((p) => !p.custom);
참("내장 프리셋 11개(10종 + 랜덤)", 내장.length === 11);
참("랜덤이 들어 있다", 내장.some((p) => p.id === "random"));
참("기존 6종 + 새 4종이 다 있다", ["balanced", "friendly_review", "polite_info", "emotional_essay", "humorous_casual",
  "expert_analysis", "storytelling", "qna_style", "concise_summary", "scene_report"].every((id) => 내장.some((p) => p.id === id)));
참("전문가 분석형은 문구가 2개 이상(변주용)", (내장.find((p) => p.id === "expert_analysis")?.instructions.length ?? 0) >= 2);

console.log("\n② 방향고르기 — 프리셋 없으면 안 건드린다, balanced 는 빈 문구라 지시 없음");
참("저장된 값이 없으면 instruction null", D.방향고르기(null).instruction === null);
const 균형 = D.방향고르기("balanced", []);
참("balanced 는 지시문이 없다(빈 문구만 있어서)", 균형.instruction === null && 균형.기록 === null);

console.log("\n③ 방향고르기 — 같은 프리셋이면 문구 변주 중 최근에 덜 쓴 것을 고른다");
const 전문가 = S.getAllPostingDirectionPresets().find((p) => p.id === "expert_analysis")!;
const 첫번째변주 = { presetId: "expert_analysis", variant: 0 };
const 둘째고름 = D.방향고르기("expert_analysis", [첫번째변주, 첫번째변주, 첫번째변주]);
참("variant 0 이 최근 꽉 찼으면 variant 1 을 고른다", 둘째고름.기록?.variant === 1);
참("그 문구가 실제 전문가 분석형의 두 번째 문구다", 둘째고름.instruction === 전문가.instructions[1]);

console.log("\n④ 방향고르기(\"random\") — 프리셋 자체를 최근과 안 겹치게 고르고, random 자신은 안 고른다");
const 최근프리셋들 = Array.from({ length: 10 }, () => ({ presetId: "balanced", variant: 0 }));
const 랜덤고름 = D.방향고르기("random", 최근프리셋들);
참("balanced 가 꽉 찼으면 다른 프리셋을 고른다", 랜덤고름.presetId !== null && 랜덤고름.presetId !== "balanced");
참("random 자신은 후보가 아니다", 랜덤고름.presetId !== "random");
const 뽑힌것들 = new Set<string>();
for (let i = 0; i < 60; i++) {
  const 고름 = D.방향고르기("random", []);
  if (고름.presetId) 뽑힌것들.add(고름.presetId);
}
참(`"random" 을 60번 고르면 여러 프리셋이 돌아 나온다 (${뽑힌것들.size}가지)`, 뽑힌것들.size >= 5);
참(`"random" 자신은 한 번도 안 뽑힌다`, !뽑힌것들.has("random"));

console.log("\n⑤ 커스텀 프리셋 — 직접 적은 한 문구만, 변주 없이 그대로 쓴다");
const 커스텀 = S.addCustomPreset({ label: "내 말투", description: "테스트", instruction: "꼭 이렇게만 써라" });
const 커스텀고름 = D.방향고르기(커스텀.id, []);
참("커스텀 프리셋은 적은 문구 그대로", 커스텀고름.instruction === "꼭 이렇게만 써라");
참("커스텀도 기록은 남는다(variant 0)", 커스텀고름.기록?.variant === 0);

console.log("\n⑥ 글 구성 \"자동\" — AI 자유 선택이 아니라 코드가 10종 중 하나를 고른다");
참("고정 번호(\"3\")면 그대로 그 구성", W.구성고르기("3")?.번호 === 3);
참("비어 있으면(null) 구성 없음", W.구성고르기(null) === null);
const 자동고른것들 = new Set<number>();
for (let i = 0; i < 60; i++) 자동고른것들.add(W.구성고르기("auto")!.번호);
참(`"auto" 를 60번 고르면 여러 구성이 돌아 나온다 (${자동고른것들.size}가지, 10종 중)`, 자동고른것들.size >= 5);
const 블록글 = W.글방식블록({ structure: "auto" });
참("\"10가지 중 AI 가 알아서\" 라는 옛 자유 선택 지시문은 더 안 남아 있다", !블록글.includes("아래 10가지 중 이 주제·자료에 가장 맞는 것 하나를 골라"));
참("대신 코드가 고른 구성 하나가 구체적으로 박혀 들어간다", /글 구성: \d+\./.test(블록글));

console.log("\n⑦ 실제로 글을 이어 쓰면 — 프롬프트에 방향 지시가 들어가고, variation_json 에 남는다");
상태적기(true, "", "claude");
S.setSetting("posting_direction_preset", "random");
const 카 = C.createCategory({ name: "시험방향", requiresSearch: false, promptHint: "시험" });
const 아이디들: number[] = [];
for (let i = 0; i < 12; i++) {
  const post = await generatePost(C.getCategory(카.id)!, assignDirectives(1)[0]);
  아이디들.push(post.id);
}
const 기록들 = 아이디들.map((id) =>
  JSON.parse((getDb().prepare("SELECT variation_json FROM posts WHERE id = ?").get(id) as any).variation_json ?? "{}"));
const 쓰인프리셋들 = new Set(기록들.map((v) => v.direction?.presetId).filter(Boolean));
참(`"random" 설정으로 12편을 쓰면 프리셋이 여러 번 바뀐다 (${쓰인프리셋들.size}가지: ${[...쓰인프리셋들].join(", ")})`, 쓰인프리셋들.size >= 3);

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
