import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { 지금주인 } from "../../tenancy.js";

/**
 * 지나간 글 목록.
 *
 * **`owner_key` 를 빼면 안 된다.** 이 길은 저장소(`posts.ts`)를 안 거치고
 * 날 SQL 을 쓰는데, 저장소 쪽 함수들은 전부 `owner_key = ?` 를 달고 있어서
 * 여기만 빠져 있었다. 그래서 체험으로 들어온 분에게 **사장님 글이 그대로
 * 보였다.** 칸막이는 한 군데만 뚫려도 없는 것과 같다.
 */
export async function historyRoutes(app: FastifyInstance) {
  app.get("/api/history", async (req) => {
    const limit = Number((req.query as { limit?: string }).limit) || 50;
    return getDb()
      .prepare(
        `SELECT p.*, c.name as category_name FROM posts p
         JOIN categories c ON c.id = p.category_id
         WHERE p.owner_key = ?
         ORDER BY p.created_at DESC LIMIT ?`,
      )
      .all(지금주인(), limit);
  });
}
