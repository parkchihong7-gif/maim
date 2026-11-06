import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { 지금주인, 관리자인가 } from "../../tenancy.js";
import { 관련글 } from "../../db/repositories/posts.js";

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
        `SELECT p.*, c.name as category_name, CASE WHEN ? THEN c.game_id END as category_game_id FROM posts p
         JOIN categories c ON c.id = p.category_id
         WHERE p.owner_key = ? AND p.status IN ('draft', 'ready')
         ORDER BY p.created_at DESC`,
      )
      .all(관리자인가() ? 1 : 0, 지금주인()) as (Record<string, unknown> & { id: number; category_id: number })[];
    // 내부링크 추천 — 큐가 보통 몇 장 안 돼 카드마다 하나씩 물어도 가볍다.
    for (const item of items) (item as Record<string, unknown>).related = 관련글(item.category_id, item.id);
    return { items };
  });
}
