/**
 * 🎨 내 블로그 분석 탭의 API. 주인·체험 모두 쓴다 — 자리(1차키)마다 따로다.
 * 체험 자리는 분석을 하루 3번까지(사장님 AI 한도를 쓰므로).
 *
 * 분석은 사람이 누를 때만 돈다. 아침 자동 글·[지금 생성] 은 승인된 결과를 읽기만 한다.
 */
import type { FastifyInstance } from "fastify";
import { 체험인가 } from "../../tenancy.js";
import { 개인설정, 개인설정정하기 } from "../../db/repositories/settings.js";
import { 버전목록, 버전읽기, 버전넣기, 버전승인, 오늘분석수, 분석만적기, type 스타일버전 } from "../../db/repositories/blogStyle.js";
import { 내글가져오기, 숫자세기, 블로그아이디 } from "../../naver/내블로그.js";
import { 가짜모드 } from "../../naver/키.js";
import { 스타일분석하기, 분석다듬기, 스타일칸, 체험_분석하루 } from "../../claude/스타일분석.js";
import { 쓰는스타일, 스타일적용중 } from "../../pipeline/내스타일.js";
import { 쓸수있나 } from "../../ai/run.js";
import { 오류적기 } from "../../db/repositories/errorLog.js";

function 자세히(v: 스타일버전) {
  let 숫자 = null;
  try { 숫자 = JSON.parse(v.stats_json ?? "null"); } catch { 숫자 = null; }
  let 분석;
  try { 분석 = 분석다듬기(JSON.parse(v.analysis_json)); } catch { 분석 = 분석다듬기({}); }
  return { id: v.id, ver: v.ver, blogId: v.blog_id, postCount: v.post_count, createdAt: v.created_at,
           approvedAt: v.approved_at, stats: 숫자, analysis: 분석 };
}

function 남은수() { return 체험인가() ? Math.max(0, 체험_분석하루 - 오늘분석수()) : null; }

export async function styleRoutes(app: FastifyInstance) {
  app.get("/api/style", async () => {
    const 목록 = 버전목록();
    const 쓰는 = 쓰는스타일();
    return {
      fake: 가짜모드(),
      labels: 스타일칸,
      blogUrl: 개인설정("style_blog_url") ?? "",
      apply: 스타일적용중(),
      activeId: 쓰는?.id ?? null,
      versions: 목록.map((v) => ({ id: v.id, ver: v.ver, createdAt: v.created_at, approvedAt: v.approved_at, postCount: v.post_count })),
      // 화면에 펼칠 것: 가장 최근 것(승인 전 초안이면 그것을 고치도록)
      current: 목록[0] ? 자세히(목록[0]) : null,
      remaining: 남은수(),
    };
  });

  app.get("/api/style/:id", async (req, reply) => {
    const v = 버전읽기(Number((req.params as { id: string }).id));
    if (!v) { reply.code(404); return { error: "그 버전을 찾을 수 없습니다." }; }
    return 자세히(v);
  });

  // [불러와 분석하기] — 공개 글 가져오기(최대 40초) + AI 분석(최대 3분). 요청이 열려 있는 동안 끝낸다.
  app.post("/api/style/analyze", async (req, reply) => {
    const url = String((req.body as { url?: string } | null)?.url ?? "").trim();
    if (!블로그아이디(url)) { reply.code(400); return { error: "블로그 주소를 알아보지 못했습니다. blog.naver.com/아이디 꼴로 넣어 주세요." }; }
    if (체험인가() && 오늘분석수() >= 체험_분석하루) {
      reply.code(429);
      return { error: `체험 키로는 블로그 분석을 하루 ${체험_분석하루}번까지 하실 수 있습니다. 내일 다시 해 주세요.` };
    }
    const 상태 = await 쓸수있나();
    if (상태.ok === false) { reply.code(409); return { error: "AI 연결이 끊겨 있어 분석할 수 없습니다. 맨 위 상태 막대를 확인해 주세요.", needsAi: true }; }
    개인설정정하기("style_blog_url", url.slice(0, 200));

    const 글 = await 내글가져오기(url);
    if (!글.ok) { reply.code(502); return { error: 글.why }; }
    if (글.posts.length < 3) { reply.code(400); return { error: `공개 글이 ${글.posts.length}편뿐이라 분석하기에 적습니다. 3편 이상일 때 해 주세요.` }; }
    const 숫자 = 숫자세기(글.posts);
    try {
      const 분석 = await 스타일분석하기(글.posts, 숫자);
      const v = 버전넣기({ blog_id: 글.blogId, post_count: 글.posts.length, stats: 숫자, analysis: 분석 });
      return { ...자세히(v), remaining: 남은수() };
    } catch (err) {
      오류적기("스타일분석", "", (err as Error).message);
      reply.code(502);
      return { error: `분석하지 못했습니다 — ${(err as Error).message}` };
    }
  });

  // [이대로 승인] — 고친 내용을 저장하고 승인, «쓰는 버전» 으로 고른다.
  app.put("/api/style/:id/approve", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!버전읽기(id)) { reply.code(404); return { error: "그 버전을 찾을 수 없습니다." }; }
    const body = (req.body ?? {}) as { analysis?: unknown; confirmed?: boolean };
    if (body.confirmed !== true) { reply.code(400); return { error: "«내용을 직접 확인했습니다» 를 체크해 주세요." }; }
    const 분석 = 분석다듬기(body.analysis);
    if (!Object.values(분석.style).some(Boolean)) { reply.code(400); return { error: "스타일 칸이 모두 비어 있습니다." }; }
    const v = 버전승인(id, 분석)!;
    개인설정정하기("style_active_id", String(v.id));
    return 자세히(v);
  });

  // 지난 승인 버전으로 되돌리기
  app.put("/api/style/active", async (req, reply) => {
    const id = Number((req.body as { id?: number } | null)?.id);
    const v = 버전읽기(id);
    if (!v || !v.approved_at) { reply.code(400); return { error: "승인한 버전만 쓸 수 있습니다." }; }
    개인설정정하기("style_active_id", String(v.id));
    return { ok: true, activeId: v.id };
  });

  // [글쓰기에 적용] 체크
  app.put("/api/style/apply", async (req, reply) => {
    const on = (req.body as { on?: boolean } | null)?.on === true;
    if (on && !쓰는스타일()) { reply.code(400); return { error: "먼저 분석 결과를 승인해 주세요." }; }
    개인설정정하기("style_apply", on ? "1" : null);
    return { ok: true, apply: on };
  });

  // ③ 진단 — 개선점마다 «글쓰기에 반영» 켜고 끄기. 승인은 그대로(다시 승인할 필요 없음).
  app.put("/api/style/:id/uses", async (req, reply) => {
    const v = 버전읽기(Number((req.params as { id: string }).id));
    if (!v) { reply.code(404); return { error: "그 버전을 찾을 수 없습니다." }; }
    const uses = (req.body as { uses?: unknown } | null)?.uses;
    if (!Array.isArray(uses)) { reply.code(400); return { error: "uses 는 참/거짓 목록이어야 합니다." }; }
    const 분석 = 분석다듬기(JSON.parse(v.analysis_json));
    분석.improvements = 분석.improvements.map((x, i) => ({ ...x, use: uses[i] !== false }));
    분석만적기(v.id, 분석);
    return 자세히(버전읽기(v.id)!);
  });
}
