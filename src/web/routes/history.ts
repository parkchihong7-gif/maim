import type { FastifyInstance } from "fastify";
import { getDb } from "../../db/index.js";
import { 지금주인, 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { getPost, 유입적기, 레인통계 } from "../../db/repositories/posts.js";
import { getCategory } from "../../db/repositories/categories.js";
import { 주문해서만들기 } from "./manualRun.js";

/**
 * 🔥 이슈 글의 **후속 글 사슬(D).** 출시 당일 글은 오후가 되면 경쟁 글에 밀린다
 * (사장님 실측 10-08, 도깨비의 세계). 같은 키워드를 다른 각도로 이어 써서 유입을 잇는다.
 */
export const 후속들 = [
  { kind: "d1", 이름: "D+1 쿠폰·초보 가이드", 각도: "후속 D+1: 쿠폰·초보 가이드 — 처음 시작하는 사람이 오늘 바로 할 것과 받을 것" },
  { kind: "d3", 이름: "D+3 공략·문제 해결", 각도: "후속 D+3: 공략·문제 해결 — 해 본 사람이 막히는 곳과 해결법, 효율 좋은 진행 순서" },
  { kind: "d7", 이름: "D+7 후기·평가", 각도: "후속 D+7: 후기·평가 — 일주일 해 본 솔직한 정리, 계속할 사람/그만둘 사람" },
] as const;

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
    const 줄들 = getDb()
      .prepare(
        `SELECT p.*, c.name as category_name FROM posts p
         JOIN categories c ON c.id = p.category_id
         WHERE p.owner_key = ?
         ORDER BY p.created_at DESC LIMIT ?`,
      )
      .all(지금주인(), limit) as Record<string, unknown>[];
    // 🔥 이슈 글마다 이미 쓴 후속(같은 키워드, 각도 «후속 D+n»)을 표시한다.
    const 후속찾기 = getDb().prepare(
      "SELECT angle FROM posts WHERE owner_key = ? AND kw = ? AND angle LIKE '후속 D+%'",
    );
    return 줄들.map((p) => {
      if (p.lane !== "issue" || !p.kw || p.event_step || String(p.angle ?? "").startsWith("후속")) return p;
      const 쓴 = (후속찾기.all(지금주인(), p.kw) as { angle: string }[]).map((r) => r.angle);
      return { ...p, followups: 후속들.map((f) => ({ kind: f.kind, name: f.이름, done: 쓴.some((a) => a.startsWith(f.각도.slice(0, 7))) })) };
    });
  });

  /** 유입 수 적기 (E). 비우면 지운다. */
  app.put("/api/posts/:id/inflow", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const 값 = (req.body as { inflow?: number | string | null })?.inflow;
    const 수 = 값 === null || 값 === undefined || 값 === "" ? null : Math.max(0, Math.round(Number(값)));
    if (수 !== null && !Number.isFinite(수)) { reply.code(400); return { error: "숫자만 넣어 주세요." }; }
    if (!유입적기(id, 수)) { reply.code(404); return { error: "글을 찾을 수 없습니다." }; }
    return { ok: true, inflow: 수 };
  });

  /** 레인별 평균 유입 (E) — 어떤 글이 실제로 사람을 데려오는지. */
  app.get("/api/history/lanes", async () => ({ lanes: 레인통계() }));

  /** 후속 글 만들기 (D) — 주인 자리만(사장님 AI 한도). */
  app.post("/api/posts/:id/follow-up", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const post = getPost(Number((req.params as { id: string }).id));
    if (!post) { reply.code(404); return { error: "글을 찾을 수 없습니다." }; }
    const 것 = 후속들.find((f) => f.kind === (req.body as { kind?: string })?.kind);
    if (!것) { reply.code(400); return { error: "후속 종류를 골라 주세요 (d1·d3·d7)." }; }
    const category = getCategory(post.category_id);
    if (!category) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const 키워드 = String(post.kw || post.title || "").trim();
    if (!키워드) { reply.code(400); return { error: "이 글의 키워드를 모릅니다." }; }
    return 주문해서만들기(category, { 키워드, 각도: 것.각도, 레인: "issue" }, reply);
  });
}
