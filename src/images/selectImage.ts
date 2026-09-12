import path from "node:path";
import { runClaude } from "../claude/runClaude.js";
import { parseImageSelectResponse } from "../claude/parseResponse.js";
import { buildImageSelectPrompt } from "../claude/promptBuilder.js";

/**
 * claude -p에 후보 이미지 로컬 경로를 직접 전달해 비전으로 최적 이미지를 고르게 한다.
 * 헤드리스 CLI가 --add-dir로 지정된 폴더 밖 파일도 Read 도구로 읽을 수 있음을
 * Phase 1에서 실제 검증했다.
 */
export async function selectBestImage(
  candidateFiles: string[],
  postSummary: string,
): Promise<string> {
  if (candidateFiles.length === 0) {
    throw new Error("이미지 후보가 없습니다.");
  }
  if (candidateFiles.length === 1) {
    return candidateFiles[0];
  }

  const dir = path.dirname(candidateFiles[0]);
  const prompt = buildImageSelectPrompt(candidateFiles, postSummary);

  const envelope = await runClaude({
    prompt,
    allowedTools: ["Read"],
    addDir: dir,
    timeoutMs: 120_000,
  });

  if (envelope.is_error) {
    throw new Error(`이미지 선택 실패: ${envelope.result}`);
  }

  const { selected_index, reason } = parseImageSelectResponse(envelope.result);
  console.log(`이미지 선택: index=${selected_index}, reason=${reason}`);
  return candidateFiles[selected_index] ?? candidateFiles[0];
}
