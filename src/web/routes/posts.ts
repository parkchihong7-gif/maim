import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { getPost, markPublished } from "../../db/repositories/posts.js";

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
}
