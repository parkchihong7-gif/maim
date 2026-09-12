import type { FastifyInstance } from "fastify";
import { DateTime } from "luxon";
import { getCategory } from "../../db/repositories/categories.js";
import { getPost, queuePost } from "../../db/repositories/posts.js";
import { assignDirectives } from "../../pipeline/directives.js";
import { generatePost } from "../../pipeline/generatePost.js";
import { attachImage } from "../../pipeline/attachImage.js";
import { publishPost } from "../../naver/publisher.js";
import { assertUnderDailyCap } from "../../scheduler/queueManager.js";
import { config } from "../../config.js";

export async function manualRunRoutes(app: FastifyInstance) {
  app.post("/api/run/generate", async (req, reply) => {
    const { categoryId } = req.body as { categoryId: number };
    const category = getCategory(categoryId);
    if (!category) {
      reply.code(404);
      return { error: "카테고리를 찾을 수 없습니다." };
    }

    const [directive] = assignDirectives(1);
    const post = await generatePost(category, directive);
    await attachImage(post);
    return getPost(post.id);
  });

  app.post("/api/run/publish", async (req, reply) => {
    const { postId } = req.body as { postId: number };
    const post = getPost(postId);
    if (!post) {
      reply.code(404);
      return { error: "포스팅을 찾을 수 없습니다." };
    }

    try {
      assertUnderDailyCap();
    } catch (err) {
      reply.code(429);
      return { error: (err as Error).message };
    }

    const scheduledAt = DateTime.now().setZone(config.timezone).toUTC().toISO()!;
    queuePost(post.id, scheduledAt);

    try {
      await publishPost({ ...post, scheduled_at: scheduledAt });
    } catch (err) {
      reply.code(500);
      return { error: (err as Error).message };
    }

    return getPost(post.id);
  });
}
