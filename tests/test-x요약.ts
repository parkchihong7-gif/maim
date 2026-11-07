/**
 * **X(트위터)에 바로 붙여넣을 요약문** 을 시험한다 — 제목·본문만으로 짧지 않은
 * (Plus 등급 기준) 요약 + 해시태그를 받고, 링크는 안 넣는 것까지.
 *
 *     npx tsx tests/test-x요약.ts
 *
 * 인터넷은 필요 없다(가짜 AI).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-xsum-"));
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
const a = process.argv.slice(2);
const p = a[a.indexOf("-p") + 1] ?? "";
if (p.includes("[X 등록 요약 요청]")) {
  const 답 = { summary: "노원구 소형 아파트 대출, 한도와 조건만 알면 복잡하지 않아요.", hashtags: ["노원구아파트", "대출조건"] };
  process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(답) }));
  process.exit(0);
}
process.stdout.write(JSON.stringify({ is_error: true, result: "모르는 요청" }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
process.env.AI_ENGINE = "claude";
delete process.env.DASHBOARD_TOKEN;
delete process.env.KEYSERVER_URL;

const { getDb } = await import("../src/db/index.js");
const X = await import("../src/claude/x트윗요약.js");
const { 상태적기 } = await import("../src/ai/run.js");

getDb();
let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① buildXSummaryPrompt — 링크·지어내기 금지, Plus 등급(25,000자) 기준임을 밝힌다");
const prompt = X.buildXSummaryPrompt("노원구 소형 아파트 대출", "본문 내용");
참("링크를 쓰지 말라고 지시한다", prompt.includes("링크는 쓰지 말"));
참("지어내지 말라고 지시한다", prompt.includes("지어내지"));
참("25,000자까지 쓸 수 있다고 알려 준다(짧게 줄이지 말라고)", prompt.includes("25,000자"));
참("본문을 충분히 준다(1500자보다 많이)", prompt.includes("본문 내용"));

console.log("\n② 트윗요약받기() — 제목·본문만으로 요약 + 해시태그를 받는다, 링크는 안 넣는다");
상태적기(true, "", "claude");
const 요약 = await X.트윗요약받기("노원구 소형 아파트 대출", "본문".repeat(60));
참("요약 글이 들어간다", 요약.text.includes("노원구 소형 아파트 대출"));
참("해시태그가 #과 함께 들어간다", 요약.text.includes("#노원구아파트") && 요약.text.includes("#대출조건"));
참("요약 안에는 링크가 없다(실제 주소는 발행 후 사람이 직접 붙인다)", !요약.text.includes("http"));

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
