/**
 * ✍️ 글 작업실 API. **주인 자리만** — 사장님 네이버 키 한도를 쓴다(체험 키는 403).
 * 아침 자동 글·[지금 생성] 과 따로 돈다. 사람이 단계마다 누를 때만 AI·네이버를 부른다.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { getCategory, listAllCategories } from "../../db/repositories/categories.js";
import { 보관함목록 } from "../../db/repositories/keywordPool.js";
import { 작업목록, 작업읽기, 작업지우기 } from "../../db/repositories/workshops.js";
import { 쓸수있나 } from "../../ai/run.js";
import { 가짜모드, 네이버키들 } from "../../naver/키.js";
import { 오류적기 } from "../../db/repositories/errorLog.js";
import { 쓰는스타일 } from "../../pipeline/내스타일.js";
import {
  작업만들기, 검색방향후보, 준비하기, 승인하기, 구간쓰기, 구간저장, 포스팅저장, 상태읽기, 단계, 구간수,
} from "../../pipeline/글작업실.js";

function 막기(reply: FastifyReply): boolean {
  if (주인자리인가()) return false;
  reply.code(403);
  return true;
}

function 자세히(id: number) {
  const w = 작업읽기(id);
  if (!w) return null;
  const s = 상태읽기(w);
  return { id: w.id, categoryId: w.category_id, categoryName: getCategory(w.category_id)?.name ?? "(지운 카테고리)",
    keyword: w.keyword, postId: w.post_id, createdAt: w.created_at, updatedAt: w.updated_at, step: 단계(s, w.post_id), state: s };
}

async function AI되나(reply: FastifyReply): Promise<boolean> {
  const 상태 = await 쓸수있나();
  if (상태.ok !== false) return true;
  reply.code(409);
  return false;
}

export async function workshopRoutes(app: FastifyInstance) {
  app.get("/api/workshop", async (_req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const 키 = 네이버키들();
    return {
      fake: 가짜모드(),
      naverReady: 가짜모드() || !!(키.searchId && 키.searchSecret),
      sections: 구간수,
      style: (() => { const s = 쓰는스타일(); return s ? { ver: s.ver } : null; })(),
      categories: listAllCategories().map((c) => ({
        id: c.id, name: c.name,
        pool: 보관함목록(c.id).filter((r) => r.status === "candidate" && ["gold", "silver", "bronze"].includes(r.grade))
          .slice(0, 15).map((r) => ({ keyword: r.keyword, grade: r.grade })),
      })),
      works: 작업목록().map((w) => ({ id: w.id, keyword: w.keyword, categoryName: getCategory(w.category_id)?.name ?? "",
        step: 단계(상태읽기(w), w.post_id), updatedAt: w.updated_at, postId: w.post_id })),
    };
  });

  app.get("/api/workshop/directions", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const kw = String((req.query as { kw?: string }).kw ?? "").trim().slice(0, 40);
    if (!kw) { reply.code(400); return { error: "키워드를 넣어 주세요." }; }
    return { items: await 검색방향후보(kw) };
  });

  app.post("/api/workshop", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const b = (req.body ?? {}) as { categoryId?: number; keyword?: string; directions?: string[] };
    if (!getCategory(Number(b.categoryId))) { reply.code(400); return { error: "카테고리를 골라 주세요." }; }
    try {
      return 자세히(작업만들기(Number(b.categoryId), String(b.keyword ?? ""), b.directions ?? []).id);
    } catch (err) { reply.code(400); return { error: (err as Error).message }; }
  });

  app.get("/api/workshop/:id", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const d = 자세히(Number((req.params as { id: string }).id));
    if (!d) { reply.code(404); return { error: "작업을 찾을 수 없습니다." }; }
    return d;
  });

  app.delete("/api/workshop/:id", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    return { ok: 작업지우기(Number((req.params as { id: string }).id)) };
  });

  // ② 상위 5개 확보 + 사전 지식 (최대 약 3분 30초)
  app.post("/api/workshop/:id/prepare", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!작업읽기(id)) { reply.code(404); return { error: "작업을 찾을 수 없습니다." }; }
    if (!(await AI되나(reply))) return { error: "AI 연결이 끊겨 있습니다. 맨 위 상태 막대를 확인해 주세요.", needsAi: true };
    try { await 준비하기(id); return 자세히(id); }
    catch (err) { 오류적기("글작업실", "", (err as Error).message); reply.code(502); return { error: `준비하지 못했습니다 — ${(err as Error).message}` }; }
  });

  // ③ 차별화 준비 승인
  app.put("/api/workshop/:id/approve", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { confirmed?: boolean; title?: string; tags?: string[]; outline?: { heading: string; point: string }[]; answers?: string[] };
    if (b.confirmed !== true) { reply.code(400); return { error: "«준비 내용을 직접 확인했습니다» 를 체크해 주세요." }; }
    try { 승인하기(id, b); return 자세히(id); }
    catch (err) { reply.code(400); return { error: (err as Error).message }; }
  });

  // ④ 한 구간 쓰기
  app.post("/api/workshop/:id/section/:n", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const p = req.params as { id: string; n: string };
    if (!작업읽기(Number(p.id))) { reply.code(404); return { error: "작업을 찾을 수 없습니다." }; }
    if (!(await AI되나(reply))) return { error: "AI 연결이 끊겨 있습니다. 맨 위 상태 막대를 확인해 주세요.", needsAi: true };
    try { await 구간쓰기(Number(p.id), Number(p.n)); return 자세히(Number(p.id)); }
    catch (err) { reply.code(400); return { error: (err as Error).message }; }
  });

  // 사람이 고친 구간·제목 저장
  app.put("/api/workshop/:id/sections", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!작업읽기(id)) { reply.code(404); return { error: "작업을 찾을 수 없습니다." }; }
    구간저장(id, (req.body ?? {}) as { sections?: string[]; title?: string });
    return 자세히(id);
  });

  // ⑤ 포스팅으로 저장
  app.post("/api/workshop/:id/save", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { stripMarks?: boolean };
    try { const r = await 포스팅저장(id, { 자료표시지우기: b.stripMarks !== false }); return { ...r, work: 자세히(id) }; }
    catch (err) { reply.code(400); return { error: (err as Error).message }; }
  });
}
