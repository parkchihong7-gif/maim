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
    // 재생성 후에도 브라우저가 예전 이미지를 캐시에서 그대로 보여주지 않도록 한다.
    reply.header("Cache-Control", "no-store");
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

  // 마음에 안 드는 이미지가 있을 때, 기존 이미지는 그대로 두고 새 이미지 1장을
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
      await attachImage(post, { count: 1, page: randomPage, append: true });
    } catch (err) {
      reply.code(500);
      return { error: (err as Error).message };
    }

    return getPost(id);
  });
}
