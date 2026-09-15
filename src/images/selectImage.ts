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

  // Claude 비전 선택은 후보를 "더 잘" 고르기 위한 단계일 뿐, 이게 실패했다고
  // 이미지 자체를 아예 못 붙이면 안 된다(타임아웃/일시적 API 오류 한 번에
  // 포스팅 전체가 이미지 없이 끝나버리는 게 실제 "이미지 생성이 안 됨" 버그의
  // 주요 원인 중 하나였다). 실패 시 순위 없이 앞에서부터 count개를 그대로
  // 채택하는 것으로 폴백해서, 이미지가 강제로라도 항상 등록되게 한다.
  let selectedIndices: number[];
  let altTexts: string[];
  try {
    const dir = path.dirname(candidateFiles[0]);
    const prompt = buildImageSelectPrompt(candidateFiles, postSummary, count);
    const envelope = await runClaude({
      prompt,
      allowedTools: ["Read"],
      addDir: dir,
      timeoutMs: 150_000,
    });
    if (envelope.is_error) {
      throw new Error(envelope.result);
    }
    const parsed = parseImageSelectResponse(envelope.result);
    selectedIndices = parsed.selected_indices;
    altTexts = parsed.alt_texts;
    console.log(`이미지 선택: indices=${selectedIndices.join(",")}, reason=${parsed.reason}`);
  } catch (err) {
    console.warn(
      `이미지 비전 선택 실패, 순위 없이 앞에서부터 ${count}장으로 대체합니다: ${(err as Error).message}`,
    );
    selectedIndices = candidateFiles.map((_, i) => i).slice(0, count);
    altTexts = [];
  }
  const chosenPaths: string[] = [];
  const chosenAlts: string[] = [];
  selectedIndices.forEach((i, idx) => {
    const file = candidateFiles[i];
    if (!file || chosenPaths.includes(file)) return;
    chosenPaths.push(file);
    chosenAlts.push(altTexts[idx] || fallbackAlt);
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
