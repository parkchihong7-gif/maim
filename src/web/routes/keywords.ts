/**
 * 🔎 네이버 키워드 탭의 API. **주인 자리만** 쓴다 — 체험 키는 403.
 * (사장님 네이버 키 한도를 쓰는 자리다.)
 *
 * 여기 있는 것은 모두 글쓰기와 따로 돈다. 글쓰기는 보관함을 읽기만 한다
 * (src/naver/보관함사용.ts).
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { 블로그검색 } from "../../naver/블로그검색.js";
import { 연관키워드, 씨앗다듬기 } from "../../naver/검색광고.js";
import { 가짜모드, 네이버키들 } from "../../naver/키.js";
import { getSetting, setSetting } from "../../db/repositories/settings.js";
import { getCategory, listAllCategories, 키워드칸적기 } from "../../db/repositories/categories.js";
import { 보관함개수, 보관함목록, 다음키워드, 키워드상태 } from "../../db/repositories/keywordPool.js";
import { 키워드모으기, 모으기진행보기, 모으기멈추기, 씨앗뽑기, 모으기한도ms, 직접씨앗, 키워드하나넣기 } from "../../naver/키워드모으기.js";
import { 전체보관함, 트렌드적기, type 보관키워드 } from "../../db/repositories/keywordPool.js";
import { 개인화점수, 내낱말 } from "../../naver/개인화점수.js";
import { 의도보기 } from "../../naver/키워드점수.js";
import { 급상승찾기 } from "../../naver/급상승.js";
import { 다가오는일정말 } from "../../db/repositories/gameEvents.js";
import { 쓰는스타일 } from "../../pipeline/내스타일.js";
import { 검색어트렌드 } from "../../naver/검색어트렌드.js";
import { 블로그검색 as 블로그찾기, 뉴스검색 } from "../../naver/블로그검색.js";
import { 내글가져오기, 블로그아이디 } from "../../naver/내블로그.js";
import { 자주낱말 } from "../../naver/낱말세기.js";
import type { Category } from "../../db/repositories/categories.js";

/** 시험으로 한 번 물어볼 말. 누구 블로그든 결과가 나오는 흔한 말로 둔다. */
const 시험말 = "블로그";
/** 한 번 모은 키워드를 쓰는 기간. 지나면 탭에 «다시 모으기 권장» 이 뜬다. */
export const 키워드유효일 = 30;

function 막기(reply: FastifyReply): boolean {
  if (주인자리인가()) return false;
  reply.code(403);
  return true;
}

/** 화면에 보내는 보관함 한 줄 — 개인화 점수·트렌드를 붙여서. */
function 줄모양(r: 보관키워드, 낱말: string[]) {
  let top: { title: string }[] = [];
  try { top = JSON.parse(r.top_json ?? "[]"); } catch { top = []; }
  let trend = null;
  try { trend = JSON.parse(r.trend_json ?? "null"); } catch { trend = null; }
  const 점 = 개인화점수(r, 낱말);
  return {
    id: r.id, keyword: r.keyword, pc: r.pc, mobile: r.mobile, comp: r.comp,
    docTotal: r.doc_total, ratio: r.ratio, grade: r.grade, seed: r.seed,
    manual: String(r.seed ?? "").startsWith("직접"),
    status: r.status, fetchedAt: r.fetched_at, usedAt: r.used_at,
    top: top.slice(0, 3).map((t) => t.title),
    score: 점.score, scoreWhy: 점.why, trend,
    intent: 의도보기(r.keyword),
    surge: r.surge_pct ?? null,
    surgeInfo: (() => { try { return JSON.parse(r.surge_json ?? "null"); } catch { return null; } })(),
  };
}

function 낱말뽑기(c: Category | null | undefined): string[] {
  return 내낱말(c ?? null, 쓰는스타일()?.분석.style ?? null);
}

function 키없음(): boolean {
  const 키 = 네이버키들();
  return !가짜모드() && !(키.searchId && 키.searchSecret);
}

function 마지막시험(): unknown {
  try { return JSON.parse(getSetting("naver_last_test") ?? "null"); } catch { return null; }
}

export async function keywordsRoutes(app: FastifyInstance) {
  app.post("/api/settings/test-naver", async (_req, reply) => {
    if (막기(reply)) return { ok: false, error: 체험은못함 };

    // 둘은 서로 상관없다. 같이 부르고, 하나가 안 돼도 다른 하나는 알려 준다.
    const [블로그, 광고] = await Promise.all([블로그검색(시험말, 1), 연관키워드([시험말])]);
    const 답 = {
      ok: 블로그.ok && 광고.ok,
      fake: 가짜모드(),
      at: new Date().toISOString(),
      search: 블로그.ok
        ? { ok: true, detail: `«${시험말}» 이미 쓰인 글 ${블로그.total.toLocaleString()}건` }
        : { ok: false, why: 블로그.why },
      ad: 광고.ok
        ? { ok: true, detail: `연관 키워드 ${광고.rows.length.toLocaleString()}개, 월간 검색량 받음` }
        : { ok: false, why: 광고.why },
    };
    setSetting("naver_last_test", JSON.stringify(답));
    return 답;
  });

  // 탭 첫 화면 — 연결 요약 + 카테고리마다 모은 상태.
  app.get("/api/keywords", async (_req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const 키 = 네이버키들();
    return {
      fake: 가짜모드(),
      validDays: 키워드유효일,
      limitMs: 모으기한도ms,
      connection: {
        searchSet: !!(키.searchId && 키.searchSecret),
        adSet: !!(키.adKey && 키.adSecret && 키.adCustomer),
        lastTest: 마지막시험(),
      },
      categories: listAllCategories().map((c) => {
        const 다음 = 다음키워드(c.id);
        return {
          id: c.id, name: c.name, active: c.active,
          apply: c.kw_apply === 1,
          refreshedAt: c.kw_refreshed_at ?? null,
          error: c.kw_error ?? null,
          paused: !!c.kw_job,
          seeds: 씨앗뽑기(c),
          customSeeds: 직접씨앗(c).length > 0,
          topicKeyword: c.topic_keyword ?? null,
          counts: 보관함개수(c.id),
          next: 다음 ? 다음.keyword : null,
          progress: 모으기진행보기(c.id),
          last: (() => { try { return JSON.parse(c.kw_last ?? "null"); } catch { return null; } })(),
        };
      }),
    };
  });

  // 한 카테고리의 보관함.
  app.get("/api/keywords/:id", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const 낱말 = 낱말뽑기(getCategory(id));
    return {
      counts: 보관함개수(id),
      progress: 모으기진행보기(id),
      styleUsed: !!쓰는스타일(),
      items: 보관함목록(id).map((r) => 줄모양(r, 낱말)),
    };
  });

  // [지금 모으기] / [이어서 모으기]. 끝날 때까지(최대 5분) 기다렸다가 답한다.
  // Cloud Run 은 요청이 열려 있을 때만 CPU 를 준다 — 뒤에서 돌리면 멈춘다.
  app.post("/api/keywords/:id/collect", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const 키 = 네이버키들();
    if (!가짜모드() && !(키.searchId && 키.searchSecret && 키.adKey && 키.adSecret && 키.adCustomer)) {
      reply.code(409);
      return { error: "네이버 키가 아직 다 들어 있지 않습니다. 위 ① 네이버 연결에서 키 5개를 넣어 주세요." };
    }
    const { resume } = (req.body ?? {}) as { resume?: boolean };
    return 키워드모으기(id, { 이어서: !!resume });
  });

  app.get("/api/keywords/:id/progress", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    return { progress: 모으기진행보기(Number((req.params as { id: string }).id)) };
  });

  app.post("/api/keywords/:id/stop", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    return { ok: 모으기멈추기(Number((req.params as { id: string }).id)) };
  });

  // [포스팅에 적용] 켜고 끄기. 쓸 키워드가 하나도 없으면 켜지 않는다.
  app.put("/api/keywords/:id/apply", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const { on } = (req.body ?? {}) as { on?: boolean };
    if (on && !다음키워드(id)) {
      reply.code(400);
      return { error: "쓸 키워드(골드·실버·브론즈)가 아직 없습니다. 먼저 ② 키워드 모으기를 해 주세요." };
    }
    키워드칸적기(id, { kw_apply: on ? 1 : 0 });
    return { ok: true, apply: !!on };
  });

  // [보류] / [후보로]. 이미 쓴 것은 바꾸지 않는다.
  app.put("/api/keywords/item/:itemId", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const itemId = Number((req.params as { itemId: string }).itemId);
    const { status } = (req.body ?? {}) as { status?: string };
    if (status !== "hold" && status !== "candidate") { reply.code(400); return { error: "상태는 hold 또는 candidate 만 됩니다." }; }
    if (!키워드상태(itemId, status)) { reply.code(404); return { error: "키워드를 찾을 수 없거나 이미 쓴 키워드입니다." }; }
    return { ok: true };
  });

  // ── E. 키워드 탭 고도화 ─────────────────────────────────────────

  // 씨앗 직접 정하기 (최대 5개). 빈 목록이면 «카테고리에서 자동» 으로 되돌린다.
  app.put("/api/keywords/:id/seeds", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    const c = getCategory(id);
    if (!c) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const raw = (req.body as { seeds?: unknown } | null)?.seeds;
    const 목록 = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\n]+/))
      .map((x) => String(x).trim().slice(0, 30)).filter(Boolean).slice(0, 5);
    키워드칸적기(id, { kw_seeds: 목록.length ? JSON.stringify(목록) : null });
    return { ok: true, seeds: 씨앗뽑기(getCategory(id)!), custom: 목록.length > 0 };
  });

  // 키워드 하나 직접 넣기 — 검색량·문서 수를 확인해 등급을 매긴다.
  app.post("/api/keywords/:id/add", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    if (키없음()) { reply.code(409); return { error: "네이버 키가 아직 없습니다. ① 네이버 연결에서 넣어 주세요." }; }
    const b = (req.body ?? {}) as { keyword?: string; from?: string };
    const 답 = await 키워드하나넣기(id, String(b.keyword ?? ""), String(b.from ?? "직접 추가"));
    if (!답.ok) { reply.code(400); return { error: 답.why }; }
    return 답;
  });

  // 트렌드 확인 — 대기 키워드 위에서부터 20개, 다섯씩 묶어 검색어트렌드를 묻고 보관함에 적는다.
  app.post("/api/keywords/:id/trend", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    if (키없음()) { reply.code(409); return { error: "네이버 키가 아직 없습니다. ① 네이버 연결에서 넣어 주세요." }; }
    const 대상 = 보관함목록(id).filter((r) => r.status === "candidate").slice(0, 20).map((r) => r.keyword);
    if (!대상.length) { reply.code(400); return { error: "보관함에 대기 키워드가 없습니다." }; }
    let 한 = 0;
    let 까닭 = "";
    for (let i = 0; i < 대상.length; i += 5) {
      const 답 = await 검색어트렌드(대상.slice(i, i + 5));
      if (!답.ok) { 까닭 = 답.why; break; }
      for (const t of 답.rows) { 트렌드적기(id, t.keyword, { ...t, at: new Date().toISOString() }); 한 += 1; }
    }
    if (!한 && 까닭) { reply.code(502); return { error: 까닭 }; }
    return { ok: true, done: 한, why: 까닭 || null };
  });

  // 🔥 급상승 찾기(B) — 보관함 대기 키워드 + 🎮 달력의 다가오는 게임 이름을 일 단위로.
  app.post("/api/keywords/:id/surge", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    if (!getCategory(id)) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    if (키없음()) { reply.code(409); return { error: "네이버 키가 아직 없습니다. ① 네이버 연결에서 넣어 주세요." }; }
    const 답 = await 급상승찾기(id, 다가오는일정말(id));
    if (!답.checked && 답.why) { reply.code(502); return { error: 답.why }; }
    return { ok: true, ...답 };
  });

  // 전체 보관함 — 모든 카테고리. 화면이 CSV 로 내려받는다.
  app.get("/api/keywords/all", async (_req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const 낱말들 = new Map<number, string[]>();
    return {
      items: 전체보관함().map((r) => {
        if (!낱말들.has(r.category_id)) 낱말들.set(r.category_id, 낱말뽑기(getCategory(r.category_id)));
        return { ...줄모양(r, 낱말들.get(r.category_id)!), categoryId: r.category_id, categoryName: r.category_name };
      }),
    };
  });

  // 트렌드 관측 — 최근 뉴스 10개와 자주 나온 낱말. 낱말을 누르면 [직접 넣기] 로 보관함에.
  app.get("/api/keywords/news", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const q = String((req.query as { q?: string }).q ?? "").trim().slice(0, 40);
    if (!q) { reply.code(400); return { error: "찾을 말을 넣어 주세요." }; }
    if (키없음()) { reply.code(409); return { error: "네이버 키가 아직 없습니다." }; }
    const 답 = await 뉴스검색(q, 10);
    if (!답.ok) { reply.code(502); return { error: 답.why }; }
    return { items: 답.items, words: 자주낱말(답.items.map((x) => `${x.title} ${x.desc}`), 15, [q]) };
  });

  // 블로그 벤치마킹 1 — 이 말로 검색했을 때 자주 보이는 블로그들.
  app.get("/api/keywords/bench", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const q = String((req.query as { q?: string }).q ?? "").trim().slice(0, 40);
    if (!q) { reply.code(400); return { error: "찾을 말을 넣어 주세요." }; }
    if (키없음()) { reply.code(409); return { error: "네이버 키가 아직 없습니다." }; }
    const 답 = await 블로그찾기(q, 50);
    if (!답.ok) { reply.code(502); return { error: 답.why }; }
    const 묶음 = new Map<string, { name: string; link: string; blogId: string | null; count: number; titles: string[] }>();
    for (const x of 답.items) {
      const 주소 = x.bloggerLink || "";
      if (!주소) continue;
      const 것 = 묶음.get(주소) ?? { name: x.blogger || 주소, link: 주소, blogId: 블로그아이디(주소), count: 0, titles: [] };
      것.count += 1;
      if (것.titles.length < 3) 것.titles.push(x.title);
      묶음.set(주소, 것);
    }
    return { blogs: [...묶음.values()].sort((a, b) => b.count - a.count).slice(0, 10) };
  });

  // 블로그 벤치마킹 2 — 고른 블로그의 공개 글 제목(최근 30)과 자주 쓰는 낱말. 원문은 읽지도 저장하지도 않는다.
  app.get("/api/keywords/bench/blog", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = String((req.query as { id?: string }).id ?? "");
    const 답 = await 내글가져오기(id, { 본문: false });
    if (!답.ok) { reply.code(502); return { error: 답.why }; }
    return { blogId: 답.blogId, titles: 답.posts.map((p) => ({ title: p.title, date: p.date, category: p.category })),
             words: 자주낱말(답.posts.map((p) => p.title), 20) };
  });

  // 🩺 모으기 점검 — 씨앗 → 연관 키워드(한꺼번에·하나씩) → 블로그 검색 하나를 실제로 불러 보고 그대로 보여 준다.
  // 몇 초면 끝난다. 보관함은 건드리지 않는다. «왜 금방 끝나나» 를 사장님 화면에서 바로 알 수 있게.
  app.get("/api/keywords/:id/check", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const c = getCategory(Number((req.params as { id: string }).id));
    if (!c) { reply.code(404); return { error: "카테고리를 찾을 수 없습니다." }; }
    const 원래 = 씨앗뽑기(c);
    const 씨앗 = 씨앗다듬기(원래);
    const 한꺼번 = await 연관키워드(씨앗);
    const 하나씩 = [];
    for (const s of 씨앗) {
      const r = await 연관키워드([s]);
      하나씩.push(r.ok ? { seed: s, ok: true, rows: r.rows.length, top: r.rows.sort((a, b) => (b.pc + b.mobile) - (a.pc + a.mobile)).slice(0, 3).map((x) => `${x.keyword}(${(x.pc + x.mobile).toLocaleString()})`) }
                       : { seed: s, ok: false, why: r.why });
    }
    const 시험말 = 한꺼번.ok && 한꺼번.rows[0] ? 한꺼번.rows[0].keyword : 씨앗[0] ?? c.name;
    const 블 = await 블로그찾기(시험말, 1);
    return {
      seedsRaw: 원래, seeds: 씨앗, customSeeds: 직접씨앗(c).length > 0,
      together: 한꺼번.ok ? { ok: true, rows: 한꺼번.rows.length, over100: 한꺼번.rows.filter((r) => r.pc + r.mobile >= 100).length } : { ok: false, why: 한꺼번.why },
      each: 하나씩,
      blog: 블.ok ? { ok: true, keyword: 시험말, total: 블.total } : { ok: false, keyword: 시험말, why: 블.why },
      fake: 가짜모드(),
    };
  });
}
