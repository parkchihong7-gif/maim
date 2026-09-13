import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { getPost, markPublished } from "../../db/repositories/posts.js";
import { attachImage } from "../../pipeline/attachImage.js";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function postsRoutes(app: FastifyInstance) {
  app.get("/api/posts/:id/image", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post || !post.image_path || !fs.existsSync(post.image_path)) {
      reply.code(404);
      return { error: "이미지를 찾을 수 없습니다." };
    }
    const ext = path.extname(post.image_path).toLowerCase();
    reply.type(MIME_BY_EXT[ext] ?? "application/octet-stream");
    // 재생성 후에도 브라우저가 예전 이미지를 캐시에서 그대로 보여주지 않도록 한다.
    reply.header("Cache-Control", "no-store");
    return fs.createReadStream(post.image_path);
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

  // 마음에 안 드는 이미지를 다른 후보로 다시 뽑는다. 검색 결과의 랜덤한 페이지에서
  // 새로 가져오므로 같은 이미지가 또 나올 확률이 낮다.
  app.post("/api/posts/:id/regenerate-image", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post) {
      reply.code(404);
      return { error: "포스팅을 찾을 수 없습니다." };
    }

    const randomPage = 1 + Math.floor(Math.random() * 3);
    try {
      await attachImage(post, { page: randomPage });
    } catch (err) {
      reply.code(500);
      return { error: (err as Error).message };
    }

    return getPost(id);
  });
}
