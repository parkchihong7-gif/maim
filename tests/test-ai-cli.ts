/**
 * **고른 AI 가 이 프로그램에 쓸 만한지 직접 확인한다.**
 *
 * 세 가지를 본다.
 *
 *   1) JSON 만 깔끔히 주는가       — 글·제목·태그를 JSON 으로 받는다
 *   2) 웹 검색이 되는가            — 뉴스형 카테고리가 이걸 쓴다
 *   3) 그림 파일을 보고 고르는가    — 후보 3장 중 어울리는 것을 고른다
 *
 * 쓰는 법
 *
 *     AI_ENGINE=claude npx tsx tests/test-ai-cli.ts
 *     AI_ENGINE=gemini npx tsx tests/test-ai-cli.ts
 *     AI_ENGINE=codex  npx tsx tests/test-ai-cli.ts
 *
 * **1번이 안 되면 그 AI 로는 못 씁니다.** 2번·3번은 안 되어도 쓸 수 있다 —
 * 검색이 안 되면 뉴스형 카테고리만 못 쓰고, 그림 고르기가 안 되면 후보
 * 앞에서부터 그냥 채택한다.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { runAI, 지금엔진 } from "../src/ai/run.js";
import { parseJsonLoose } from "../src/claude/parseResponse.js";
import { config } from "../src/config.js";

const 것 = 지금엔진();

async function 첫째_JSON만_주는가() {
  console.log("\n① JSON 만 깔끔히 주는가  (이게 안 되면 못 씁니다)");
  const 답 = await runAI({
    prompt: '반드시 순수 JSON으로만 답하라: {"hello": "world"}',
    timeoutMs: 60_000,
  });
  const 깐것 = parseJsonLoose(답) as { hello?: string };
  if (깐것.hello !== "world") throw new Error(`예상과 다른 답: ${답.slice(0, 300)}`);
  console.log("   ✅ 통과");
}

async function 둘째_검색이_되는가() {
  console.log("\n② 웹 검색이 되는가  (안 되면 뉴스형 카테고리만 못 씁니다)");
  const 답 = await runAI({
    prompt: '웹 검색을 사용해서 오늘 날짜를 확인하고 JSON으로만 답하라: {"today": "YYYY-MM-DD"}',
    needsSearch: true,
    timeoutMs: 120_000,
  });
  const 깐것 = parseJsonLoose(답) as { today?: string };
  console.log("   검색이 말한 오늘:", 깐것.today);
  if (!깐것.today || !/^\d{4}-\d{2}-\d{2}$/.test(깐것.today)) {
    throw new Error(`날짜 모양이 아닙니다: ${답.slice(0, 300)}`);
  }
  console.log("   ✅ 통과");
}

async function 셋째_그림을_보는가() {
  console.log("\n③ 그림 파일을 보고 고르는가  (안 되면 앞에서부터 채택합니다)");
  const 방 = path.join(config.paths.dataDir, "ai-test");
  fs.mkdirSync(방, { recursive: true });
  const 빨강 = path.join(방, "red.jpg");
  const 초록 = path.join(방, "green.jpg");
  await sharp({ create: { width: 200, height: 150, channels: 3,
                          background: { r: 220, g: 50, b: 50 } } }).jpeg().toFile(빨강);
  await sharp({ create: { width: 200, height: 150, channels: 3,
                          background: { r: 40, g: 160, b: 80 } } }).jpeg().toFile(초록);
  try {
    const 답 = await runAI({
      prompt: `다음 두 이미지를 읽어라: ${빨강} 와 ${초록}. `
            + `이 중 초록색 이미지의 파일 경로만 JSON으로 답하라: {"green_file": "..."}`,
      readDir: 방,
      timeoutMs: 120_000,
    });
    const 깐것 = parseJsonLoose(답) as { green_file?: string };
    console.log("   고른 것:", 깐것.green_file);
    if (깐것.green_file !== 초록) throw new Error(`엉뚱한 것을 골랐습니다: ${답.slice(0, 300)}`);
    console.log("   ✅ 통과");
  } finally {
    fs.rmSync(방, { recursive: true, force: true });
  }
}

async function main() {
  console.log(`━━━ ${것.label} 확인 ━━━`);
  console.log(`   ${것.cost.replace(/\*\*/g, "")}`);

  await 첫째_JSON만_주는가();   // 여기서 실패하면 그대로 멈춘다

  let 검색 = true;
  let 그림 = true;
  try {
    await 둘째_검색이_되는가();
  } catch (탈) {
    검색 = false;
    console.log("   ⚠️  안 됩니다 —", (탈 as Error).message.slice(0, 200));
  }
  try {
    await 셋째_그림을_보는가();
  } catch (탈) {
    그림 = false;
    console.log("   ⚠️  안 됩니다 —", (탈 as Error).message.slice(0, 200));
  }

  console.log(`\n━━━ ${것.label} 결과 ━━━`);
  console.log("   글쓰기          ✅ 됩니다");
  console.log(`   뉴스형 카테고리  ${검색 ? "✅ 됩니다" : "❌ 안 됩니다 — 카테고리에서 검색을 꺼 두세요"}`);
  console.log(`   그림 고르기      ${그림 ? "✅ 됩니다" : "⚠️  안 됩니다 — 후보 앞에서부터 그냥 채택합니다"}`);
  console.log(검색 && 그림
    ? "\n이 AI 로 전부 됩니다."
    : "\n쓸 수는 있습니다. 위에 ❌·⚠️ 가 붙은 것만 빼고 돕니다.");
}

main().catch((탈) => {
  console.error(`\n❌ ${것.label} 로는 못 씁니다:`, 탈 instanceof Error ? 탈.message : 탈);
  process.exit(1);
});
