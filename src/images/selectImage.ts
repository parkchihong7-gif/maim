import path from "node:path";
import { runClaude } from "../claude/runClaude.js";
import { parseImageSelectResponse } from "../claude/parseResponse.js";
import { buildImageSelectPrompt } from "../claude/promptBuilder.js";

export interface SelectedImage {
  filePath: string;
  alt: string;
}

/**
 * claude -p에 후보 이미지 로컬 경로를 직접 전달해 비전으로 상위 `count`개를
 * 어울리는 순서대로, SEO용 대체텍스트와 함께 고르게 한다. 헤드리스 CLI가
 * --add-dir로 지정된 폴더 밖 파일도 Read 도구로 읽을 수 있음을 Phase 1에서
 * 실제 검증했다.
 */
export async function selectBestImages(
  candidateFiles: string[],
  postSummary: string,
  count: number,
): Promise<SelectedImage[]> {
  if (candidateFiles.length === 0) {
    throw new Error("이미지 후보가 없습니다.");
  }

  const fallbackAlt = (postSummary || "블로그 포스트 관련 이미지").slice(0, 40);

  if (candidateFiles.length <= count) {
    return candidateFiles.map((filePath) => ({ filePath, alt: fallbackAlt }));
  }

  const dir = path.dirname(candidateFiles[0]);
  const prompt = buildImageSelectPrompt(candidateFiles, postSummary, count);

  const envelope = await runClaude({
    prompt,
    allowedTools: ["Read"],
    addDir: dir,
    timeoutMs: 150_000,
  });

  if (envelope.is_error) {
    throw new Error(`이미지 선택 실패: ${envelope.result}`);
  }

  const { selected_indices, alt_texts, reason } = parseImageSelectResponse(envelope.result);
  console.log(`이미지 선택: indices=${selected_indices.join(",")}, reason=${reason}`);

  const chosenPaths: string[] = [];
  const chosenAlts: string[] = [];
  selected_indices.forEach((i, idx) => {
    const file = candidateFiles[i];
    if (!file || chosenPaths.includes(file)) return;
    chosenPaths.push(file);
    chosenAlts.push(alt_texts[idx] || fallbackAlt);
  });

  // 모델이 개수를 못 채웠으면 남은 후보로 채운다.
  for (const file of candidateFiles) {
    if (chosenPaths.length >= count) break;
    if (!chosenPaths.includes(file)) {
      chosenPaths.push(file);
      chosenAlts.push(fallbackAlt);
    }
  }

  return chosenPaths.slice(0, count).map((filePath, idx) => ({ filePath, alt: chosenAlts[idx] }));
}
