import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { remainingDailyCapacity, effectiveDailyCap } from "../../scheduler/queueManager.js";
import { config } from "../../config.js";

export async function queueRoutes(app: FastifyInstance) {
  app.get("/api/queue", async () => {
    const items = getDb()
      .prepare(
        `SELECT p.*, c.name as category_name FROM posts p
         JOIN categories c ON c.id = p.category_id
         WHERE p.status IN ('draft', 'ready')
         ORDER BY p.created_at DESC`,
      )
      .all();
    return {
      remainingToday: remainingDailyCapacity(),
      dailyCap: effectiveDailyCap(config.postsPerDay),
      items,
    };
  });
}
