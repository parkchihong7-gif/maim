import type { FastifyInstance } from "fastify";
import { listImageDownloads } from "../../db/repositories/imageDownloads.js";

const CSV_HEADERS = ["포스팅ID", "포스팅 제목", "이미지 순번", "출처 사이트", "출처 이미지 ID", "출처 페이지 URL", "라이선스", "다운로드 시각"];

function toCsvField(value: string | number | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  // 값에 쉼표/줄바꿈/큰따옴표가 있으면 큰따옴표로 감싸고, 내부 큰따옴표는 두 번 써서 이스케이프한다.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function imageDownloadsRoutes(app: FastifyInstance) {
  // 무료 스톡 이미지(Unsplash/Pexels/Pixabay) 사용 기록을 CSV로 내려받는다.
  // 나중에 "이 이미지를 언제/어디서/어떤 라이선스로 받았는지" 증빙이 필요할 때 쓴다.
  app.get("/api/image-downloads/csv", async (_req, reply) => {
    const rows = listImageDownloads();
    const lines = [
      CSV_HEADERS.join(","),
      ...rows.map((r) =>
        [
          toCsvField(r.post_id),
          toCsvField(r.post_title),
          toCsvField(r.image_index + 1),
          toCsvField(r.source_site),
          toCsvField(r.source_id),
          toCsvField(r.source_url),
          toCsvField(r.license),
          toCsvField(r.downloaded_at),
        ].join(","),
      ),
    ];
    // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 앞에 붙인다.
    const csv = "﻿" + lines.join("\r\n") + "\r\n";
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="image-downloads.csv"`);
    return csv;
  });
}
