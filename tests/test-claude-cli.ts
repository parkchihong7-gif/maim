/**
 * Phase 1 검증 스크립트: `claude -p` 헤드리스 CLI가 이 프로젝트가 의존하는
 * 세 가지 동작을 실제로 수행하는지 확인한다.
 *   1) --output-format json 이 result 필드에 순수 JSON 문자열을 담아 반환하는지
 *   2) --allowedTools WebSearch 로 실제 최신 정보를 검색해 반영하는지
 *   3) --allowedTools Read --add-dir 로 로컬 이미지 파일을 비전으로 판단할 수 있는지
 *
 * 사용법: npx tsx tests/test-claude-cli.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { runClaude } from "../src/claude/runClaude.js";
import { parseJsonLoose } from "../src/claude/parseResponse.js";
import { config } from "../src/config.js";

async function testJsonOutput() {
  console.log("=== 1) --output-format json 기본 동작 확인 ===");
  const envelope = await runClaude({
    prompt: '반드시 순수 JSON으로만 답하라: {"hello": "world"}',
    noTools: true,
    timeoutMs: 60_000,
  });
  const parsed = parseJsonLoose(envelope.result) as { hello?: string };
  if (parsed.hello !== "world") {
    throw new Error(`예상치 못한 응답: ${envelope.result}`);
  }
  console.log("통과: result 필드에서 JSON을 정상적으로 파싱했습니다.");
}

async function testWebSearch() {
  console.log("\n=== 2) WebSearch로 실제 최신 정보 검색 확인 ===");
  const envelope = await runClaude({
    prompt:
      '웹 검색을 사용해서 오늘 날짜를 확인하고 JSON으로만 답하라: {"today": "YYYY-MM-DD"}',
    allowedTools: ["WebSearch"],
    timeoutMs: 90_000,
  });
  const parsed = parseJsonLoose(envelope.result) as { today?: string };
  console.log("검색 결과 오늘 날짜:", parsed.today);
  if (!parsed.today || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.today)) {
    throw new Error(`날짜 형식이 올바르지 않습니다: ${envelope.result}`);
  }
  console.log("통과: WebSearch 도구가 정상 동작했습니다.");
}

async function testVisionOverLocalFiles() {
  console.log("\n=== 3) 로컬 이미지 파일 비전 판단 확인 ===");
  const dir = path.join(config.paths.dataDir, "phase1-test");
  fs.mkdirSync(dir, { recursive: true });
  const redFile = path.join(dir, "red.jpg");
  const greenFile = path.join(dir, "green.jpg");
  await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 220, g: 50, b: 50 } } })
    .jpeg()
    .toFile(redFile);
  await sharp({ create: { width: 200, height: 150, channels: 3, background: { r: 40, g: 160, b: 80 } } })
    .jpeg()
    .toFile(greenFile);

  const envelope = await runClaude({
    prompt: `다음 두 이미지를 읽어라: ${redFile} 와 ${greenFile}. 이 중 초록색 이미지의 파일 경로만 JSON으로 답하라: {"green_file": "..."}`,
    allowedTools: ["Read"],
    addDir: dir,
    timeoutMs: 90_000,
  });
  const parsed = parseJsonLoose(envelope.result) as { green_file?: string };
  console.log("판단 결과:", parsed.green_file);
  if (parsed.green_file !== greenFile) {
    throw new Error(`예상과 다른 파일을 골랐습니다: ${envelope.result}`);
  }
  console.log("통과: 로컬 이미지 비전 판단이 정상 동작했습니다.");

  fs.rmSync(dir, { recursive: true, force: true });
}

async function main() {
  await testJsonOutput();
  await testWebSearch();
  await testVisionOverLocalFiles();
  console.log("\n모든 claude -p 하부 동작 검증 통과.");
}

main().catch((err) => {
  console.error("검증 실패:", err);
  process.exit(1);
});
