import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { 지금주인 } from "../../tenancy.js";

/**
 * 아직 안 쓰신 초안 목록.
 *
 * `history.ts` 와 같은 구멍이 여기에도 있었다 — `owner_key` 없이 전부를
 * 긁어 오고 있었다. 저장소를 안 거치고 날 SQL 을 쓰는 길이 이 둘뿐인데,
 * 하필 둘 다 빠져 있었다.
 */
export async function queueRoutes(app: FastifyInstance) {
  app.get("/api/queue", async () => {
    const items = getDb()
      .prepare(
        `SELECT p.*, c.name as category_name FROM posts p
         JOIN categories c ON c.id = p.category_id
         WHERE p.owner_key = ? AND p.status IN ('draft', 'ready')
         ORDER BY p.created_at DESC`,
      )
      .all(지금주인());
    return { items };
  });
}
