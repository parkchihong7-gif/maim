/**
 * Phase 3 검증 스크립트.
 *
 * 1) UNSPLASH_ACCESS_KEY / PEXELS_API_KEY가 설정돼 있으면 실제 검색+다운로드까지 수행.
 * 2) 키가 없으면(샌드박스 기본값) 합성 이미지 후보로 selectImage + processImage 단계만 검증하고
 *    검색 API 부분은 "키 미설정" 에러가 올바르게 나는지만 확인한다.
 *
 * 사용법: npx tsx tests/test-image-pipeline.ts
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { config } from "../src/config.js";
import { searchAndDownloadCandidates, type DownloadedCandidate } from "../src/images/searchImages.js";
import { selectBestImages } from "../src/images/selectImage.js";
import { processImage } from "../src/images/processImage.js";

const TEST_DIR = path.join(config.paths.generatedDir, "phase3-test");

async function makeSyntheticCandidates(): Promise<DownloadedCandidate[]> {
  const dir = path.join(TEST_DIR, "candidates");
  fs.mkdirSync(dir, { recursive: true });
  const specs = [
    { name: "office_red.jpg", bg: { r: 210, g: 60, b: 60 } },
    { name: "forest_green.jpg", bg: { r: 40, g: 150, b: 80 } },
    { name: "ocean_blue.jpg", bg: { r: 40, g: 100, b: 200 } },
  ];
  const candidates: DownloadedCandidate[] = [];
  for (const spec of specs) {
    const filePath = path.join(dir, spec.name);
    await sharp({ create: { width: 800, height: 600, channels: 3, background: spec.bg } })
      .jpeg()
      .toFile(filePath);
    candidates.push({
      filePath,
      sourceSite: "unsplash",
      sourceId: spec.name,
      sourceUrl: `https://example.com/${spec.name}`,
      license: "test",
    });
  }
  return candidates;
}

async function main() {
  console.log("=== 1) 실제 스톡 이미지 검색 API 확인 ===");
  if (!config.unsplashAccessKey && !config.pexelsApiKey) {
    console.log("UNSPLASH_ACCESS_KEY / PEXELS_API_KEY 미설정 — 실패 시 에러 메시지만 확인합니다.");
    try {
      await searchAndDownloadCandidates("autumn forest camping", path.join(TEST_DIR, "live-search"));
      console.log("(예상과 다르게 성공했습니다. 키가 설정되어 있었나 봅니다.)");
    } catch (err) {
      console.log("예상된 실패:", (err as Error).message);
    }
  } else {
    const files = await searchAndDownloadCandidates(
      "autumn forest camping",
      path.join(TEST_DIR, "live-search"),
    );
    console.log("실제 검색 결과 후보:", files);
  }

  console.log("\n=== 2) 비전 선택 + 프로그래밍적 가공 파이프라인 (합성 이미지) ===");
  const candidates = await makeSyntheticCandidates();
  console.log("합성 후보:", candidates);

  const postSummary =
    "이번 가을 숲속 캠핑 여행에서 만난 단풍과 캠프파이어, 자연 속 힐링에 대한 블로그 글입니다.";
  const selected = await selectBestImages(candidates, postSummary, 1);
  console.log("선택된 이미지:", selected);

  const finalPath = path.join(TEST_DIR, "final.jpg");
  await processImage(selected[0].filePath, finalPath, {
    targetWidth: 760,
    aspectRatio: 4 / 3,
    overlayText: "가을 숲속 캠핑 여행기",
  });

  const meta = await sharp(finalPath).metadata();
  console.log("최종 이미지:", finalPath, `(${meta.width}x${meta.height}, ${meta.format})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
