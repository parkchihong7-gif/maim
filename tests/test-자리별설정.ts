/**
 * **체험 키마다 글 스타일이 따로 저장되는지 시험한다.**
 *
 *     npx tsx tests/test-자리별설정.ts
 *
 * 인터넷도, AI 로그인도 필요 없다. 임시 폴더에 DB 를 새로 만들고, 진짜
 * claude 대신 «받은 지시문을 파일에 적고 정해진 글을 돌려주는» 가짜를 쓴다.
 * 그래서 체험 A 가 글을 만들 때 **AI 에게 A 의 스타일이 실제로 전달되는지**
 * 까지 본다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// config 가 import 되는 순간 환경변수를 읽는다. 그 전에 임시 자리로 돌려 둔다.
const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-seat-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(기록)}, a[a.indexOf("-p") + 1] ?? "");
const 본문 = "가짜 본문입니다. ".repeat(80);
const 글 = { title: "시험 제목 하나", content: 본문, image_query: "test",
  tags: ["#가","#나","#다","#라","#마"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";

const { getDb } = await import("../src/db/index.js");
const { 자리에서, 주인 } = await import("../src/tenancy.js");
const S = await import("../src/db/repositories/settings.js");
const { purgeTenant } = await import("../src/db/repositories/tenants.js");
const { createCategory } = await import("../src/db/repositories/categories.js");
const { generatePost } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");

getDb();
const 체험A = { ownerKey: "KEY-A", role: "client" };
const 체험B = { ownerKey: "KEY-B", role: "client" };
const 체험C = { ownerKey: "KEY-C", role: "client" };

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① 각자 정한 스타일은 각자에게만 보인다");
자리에서(주인, () => { S.개인설정정하기("blog_topic", "movie"); S.최소분량정하기(1500); });
자리에서(체험A, () => {
  S.개인설정정하기("blog_topic", "cooking_recipe");
  S.개인설정정하기("posting_direction_refinement", "A 님 말투로 짧게");
});
자리에서(체험B, () => S.개인설정정하기("blog_topic", "game"));

참("주인은 영화", 자리에서(주인, () => S.개인설정("blog_topic")) === "movie");
참("체험 A 는 요리", 자리에서(체험A, () => S.개인설정("blog_topic")) === "cooking_recipe");
참("체험 B 는 게임", 자리에서(체험B, () => S.개인설정("blog_topic")) === "game");
참("체험 B 에게 A 의 보강 문구가 안 보인다",
  자리에서(체험B, () => S.개인설정("posting_direction_refinement")) === null);

console.log("\n② 안 정한 체험 회원은 주인 스타일을 빌려 쓰지 않는다 (글자수만 예외)");
참("체험 C 의 주제는 비어 있다 (주인의 영화가 아님)",
  자리에서(체험C, () => S.개인설정("blog_topic")) === null);
참("체험 C 의 최소 글자수는 주인 기준 1500 을 따른다", 자리에서(체험C, () => S.최소분량()) === 1500);
자리에서(체험A, () => S.최소분량정하기(2000));
참("체험 A 가 2000 으로 바꾸면 A 만 2000", 자리에서(체험A, () => S.최소분량()) === 2000);
참("주인은 그대로 1500", 자리에서(주인, () => S.최소분량()) === 1500);
참("주인의 settings 표에 체험 값이 새지 않았다", S.getSetting("blog_topic") === "movie");

console.log("\n③ 체험 A 가 만든 글에는 A 의 스타일이 AI 에게 전달된다");
자리에서(체험A, () => S.최소분량정하기(800));
const 카테고리A = 자리에서(체험A, () =>
  createCategory({ name: "시험", requiresSearch: false, promptHint: "시험 글" }));
await 자리에서(체험A, () => generatePost(카테고리A, assignDirectives(1)[0]));
const 지시A = fs.readFileSync(기록, "utf8");
참("지시문에 A 의 주제 「요리·레시피」가 있다", 지시A.includes("요리·레시피"));
참("지시문에 A 의 보강 문구가 있다", 지시A.includes("A 님 말투로 짧게"));
참("지시문에 주인의 「영화」가 없다", !지시A.includes("\"영화\""));

const 카테고리주인 = 자리에서(주인, () =>
  createCategory({ name: "주인시험", requiresSearch: false, promptHint: "주인 글" }));
자리에서(주인, () => S.최소분량정하기(800));
await 자리에서(주인, () => generatePost(카테고리주인, assignDirectives(1)[0]));
const 지시주인 = fs.readFileSync(기록, "utf8");
참("주인 글의 지시문에는 주인의 「영화」가 있다", 지시주인.includes("\"영화\""));
참("주인 글의 지시문에 A 의 보강 문구가 없다", !지시주인.includes("A 님 말투로 짧게"));

console.log("\n④ 자리별 설정이 아닌 칸은 이 길로 못 쓴다");
let 막혔나 = false;
try { 자리에서(체험A, () => S.개인설정정하기("unsplash_access_key", "x")); } catch { 막혔나 = true; }
참("체험 A 가 이미지 키를 자리별 설정으로 쓰려 하면 막힌다", 막혔나);

console.log("\n⑤ 체험 키를 지우면 그 사람 스타일도 같이 지워진다");
const 결과 = purgeTenant("KEY-A");
참(`A 의 스타일 줄이 지워졌다 (${결과.settings}줄)`, 결과.settings >= 3);
참("A 의 주제는 이제 비어 있다", 자리에서(체험A, () => S.개인설정("blog_topic")) === null);
참("B 는 그대로 게임", 자리에서(체험B, () => S.개인설정("blog_topic")) === "game");
참("주인은 그대로 영화", 자리에서(주인, () => S.개인설정("blog_topic")) === "movie");

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
