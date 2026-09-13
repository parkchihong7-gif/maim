import type { FastifyInstance } from "fastify";
import { getCategory } from "../../db/repositories/categories.js";
import { getPost, markReady } from "../../db/repositories/posts.js";
import { assignDirectives } from "../../pipeline/directives.js";
import { generatePost } from "../../pipeline/generatePost.js";
import { attachImage } from "../../pipeline/attachImage.js";
import { assertUnderDailyCap } from "../../scheduler/queueManager.js";

export async function manualRunRoutes(app: FastifyInstance) {
  app.post("/api/run/generate", async (req, reply) => {
    const { categoryId } = req.body as { categoryId: number };
    const category = getCategory(categoryId);
    if (!category) {
      reply.code(404);
      return { error: "카테고리를 찾을 수 없습니다." };
    }

    try {
      assertUnderDailyCap();
    } catch (err) {
      reply.code(429);
      return { error: (err as Error).message };
    }

    const [directive] = assignDirectives(1);
    const post = await generatePost(category, directive);

    try {
      await attachImage(post);
    } catch (err) {
      markReady(post.id);
      return { ...getPost(post.id), imageError: (err as Error).message };
    }

    markReady(post.id);
    return getPost(post.id);
  });
}
