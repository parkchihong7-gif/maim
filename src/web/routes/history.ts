import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";

export async function historyRoutes(app: FastifyInstance) {
  app.get("/api/history", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit) || 50;
    return getDb()
      .prepare(
        `SELECT p.*, c.name as category_name FROM posts p
         JOIN categories c ON c.id = p.category_id
         ORDER BY p.created_at DESC LIMIT ?`,
      )
      .all(limit);
  });
}
