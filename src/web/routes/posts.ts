import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { getPost, getImagePaths, markPublished } from "../../db/repositories/posts.js";
import { attachImage } from "../../pipeline/attachImage.js";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function postsRoutes(app: FastifyInstance) {
  app.get("/api/posts/:id/image/:index", async (req, reply) => {
    const { id, index } = req.params as { id: string; index: string };
    const post = getPost(Number(id));
    if (!post) {
      reply.code(404);
      return { error: "포스팅을 찾을 수 없습니다." };
    }
    const imagePath = getImagePaths(post)[Number(index)];
    if (!imagePath || !fs.existsSync(imagePath)) {
      reply.code(404);
      return { error: "이미지를 찾을 수 없습니다." };
    }
    const ext = path.extname(imagePath).toLowerCase();
    reply.type(MIME_BY_EXT[ext] ?? "application/octet-stream");
    // 재생성은 기존 인덱스를 덮어쓰지 않고 항상 새 인덱스를 추가하므로, 같은
    // (id, index) 조합의 파일 내용은 한 번 만들어지면 절대 안 바뀐다 — 오래
    // 캐시해도 안전하고, 대시보드가 매 15초 자동 새로고침할 때마다 이미 받은
    // 이미지를 또 통째로 재다운로드하는 것도 막아준다.
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    // URL 자체에는 확장자가 없어서, 브라우저가 "다른 이름으로 이미지 저장" 시
    // 형식을 잘못 추측해(예: macOS에서 .jfif) 저장하는 경우가 있다. 파일명을
    // 명시해 항상 올바른 확장자로 저장되게 한다(가공 파이프라인은 항상 .jpg).
    reply.header("Content-Disposition", `inline; filename="post-${id}-image-${Number(index) + 1}${ext}"`);
    return fs.createReadStream(imagePath);
  });

  // 실제 네이버 발행은 사용자가 대시보드에서 복사해 직접 수행한다 — 이 엔드포인트는
  // 자동화가 아니라 "사용자가 발행을 완료했다고 스스로 표시"하는 기록용이다.
  app.post("/api/posts/:id/mark-published", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post) {
      reply.code(404);
      return { error: "포스팅을 찾을 수 없습니다." };
    }
    markPublished(id);
    return getPost(id);
  });

  // 마음에 안 드는 이미지가 있을 때, 기존 이미지는 그대로 두고 새 이미지 3장을
  // 오른쪽에 추가한다. 검색 결과의 랜덤한 페이지에서 가져오므로 같은 이미지가
  // 또 나올 확률이 낮다.
  app.post("/api/posts/:id/regenerate-image", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post) {
      reply.code(404);
      return { error: "포스팅을 찾을 수 없습니다." };
    }

    const randomPage = 1 + Math.floor(Math.random() * 3);
    try {
      await attachImage(post, { count: 3, page: randomPage, append: true });
    } catch (err) {
      reply.code(500);
      return { error: (err as Error).message };
    }

    return getPost(id);
  });
}
