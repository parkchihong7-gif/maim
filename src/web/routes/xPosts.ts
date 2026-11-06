import type { FastifyInstance } from "fastify";
import { getPost, X등록목록, X등록, X등록해제, X요약적기 } from "../../db/repositories/posts.js";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { 쓸수있나 } from "../../ai/run.js";
import { 오류적기 } from "../../db/repositories/errorLog.js";
import { 트윗요약받기 } from "../../claude/x트윗요약.js";

const 플랫폼들 = ["naver", "tistory"] as const;

/**
 * 📣 X(트위터) 등록 리스트 — 발행은 사람이 하므로(자동 발행 금지), 실제
 * 글 주소도 이 프로그램이 미리 모른다. 사람이 발행 후 주소를 넣으면
 * 등록 리스트에 올라가고, AI 요약은 주소 없이도 먼저 만들 수 있다.
 *
 * **자동으로 X 에 올리지 않는다** — 2026-11-06 검토: X API 는 신규
 * 개발자에게 무료 글쓰기를 더 주지 않는다(건당 과금). 전부 주인 자리만.
 */
export async function xPostsRoutes(app: FastifyInstance) {
  app.get("/api/x-posts", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const limit = Number((req.query as { limit?: string }).limit) || 100;
    return { items: X등록목록(limit) };
  });

  app.put("/api/posts/:id/x-register", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post) { reply.code(404); return { error: "글을 찾을 수 없습니다." }; }
    const body = (req.body ?? {}) as { url?: string; platform?: string };
    const url = String(body.url ?? "").trim();
    const platform = String(body.platform ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) {
      reply.code(400);
      return { error: "실제 발행된 글 주소(http로 시작)를 넣어 주세요." };
    }
    if (!(플랫폼들 as readonly string[]).includes(platform)) {
      reply.code(400);
      return { error: "플랫폼을 네이버 블로그·티스토리 중에서 골라 주세요." };
    }
    X등록(id, url, platform);
    return getPost(id);
  });

  app.delete("/api/posts/:id/x-register", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const id = Number((req.params as { id: string }).id);
    if (!getPost(id)) { reply.code(404); return { error: "글을 찾을 수 없습니다." }; }
    X등록해제(id);
    return getPost(id);
  });

  /** AI 로 요약을 (다시) 만든다. */
  app.post("/api/posts/:id/x-summary", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const id = Number((req.params as { id: string }).id);
    const post = getPost(id);
    if (!post) { reply.code(404); return { error: "글을 찾을 수 없습니다." }; }
    const 글 = String(post.final_content || post.content || "").trim();
    if (!post.title || 글.length < 50) { reply.code(400); return { error: "요약할 글 내용이 부족합니다." }; }
    const 상태 = await 쓸수있나();
    if (상태.ok === false) {
      reply.code(409);
      return { error: "AI 연결이 끊겨 있어 요약을 만들 수 없습니다. 맨 위 상태 막대를 확인해 주세요.", needsAi: true };
    }
    try {
      const 결과 = await 트윗요약받기(post.title, 글);
      X요약적기(id, 결과.text);
      return getPost(id);
    } catch (err) {
      오류적기("X 요약 생성", post.title ?? "", (err as Error).message);
      reply.code(502);
      return { error: `요약을 만들지 못했습니다 — ${(err as Error).message}` };
    }
  });

  /** 사람이 요약문을 직접 고쳐 저장한다(AI 를 다시 부르지 않음). */
  app.put("/api/posts/:id/x-summary", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const id = Number((req.params as { id: string }).id);
    if (!getPost(id)) { reply.code(404); return { error: "글을 찾을 수 없습니다." }; }
    const text = String((req.body as { text?: string } | undefined)?.text ?? "").trim();
    if (!text) { reply.code(400); return { error: "요약 내용을 입력해 주세요." }; }
    X요약적기(id, text.slice(0, 1000));
    return getPost(id);
  });
}
