import sharp from "sharp";

export interface ProcessImageOptions {
  targetWidth?: number;
  aspectRatio?: number; // width / height
  brightness?: number; // 1.0 = 변화 없음
  saturation?: number;
  overlayText?: string;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 생성형 AI 이미지 편집 없이, 프로그래밍적 가공(크롭/리사이즈/밝기·채도 보정/텍스트 오버레이)만 적용한다.
 */
export async function processImage(
  inputPath: string,
  outputPath: string,
  options: ProcessImageOptions = {},
): Promise<void> {
  const targetWidth = options.targetWidth ?? 760;
  const aspectRatio = options.aspectRatio ?? 4 / 3;
  const targetHeight = Math.round(targetWidth / aspectRatio);

  let pipeline = sharp(inputPath)
    .resize(targetWidth, targetHeight, { fit: "cover", position: "attention" })
    .modulate({
      brightness: options.brightness ?? 1.03,
      saturation: options.saturation ?? 1.08,
    });

  if (options.overlayText) {
    const barHeight = 70;
    const svg = `
      <svg width="${targetWidth}" height="${targetHeight}">
        <rect x="0" y="${targetHeight - barHeight}" width="${targetWidth}" height="${barHeight}" fill="black" fill-opacity="0.4"/>
        <text x="24" y="${targetHeight - 26}" font-family="sans-serif" font-size="28" fill="white">${escapeXml(
          options.overlayText,
        )}</text>
      </svg>`;
    pipeline = pipeline.composite([{ input: Buffer.from(svg), gravity: "south" }]);
  }

  await pipeline.jpeg({ quality: 88 }).toFile(outputPath);
}
