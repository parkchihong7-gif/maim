/**
 * 🎮 출시·업데이트 달력 API — **주인 자리만** (사장님 AI 한도를 쓴다).
 *
 *   GET    /api/events              일정 + 단계 계획(A~F)
 *   POST   /api/events              게임 넣기
 *   PUT    /api/events/:id          고치기
 *   DELETE /api/events/:id          지우기
 *   POST   /api/events/:id/steps/:k/generate   그 단계 글 만들기
 *   POST   /api/events/:id/steps/:k/skip       건너뛰기(다시 누르면 되돌림)
 *   GET    /api/events/today        🔔 오늘 할 단계 (홈 알림)
 *   POST   /api/events/discover     🔍 출시 예정 게임 찾기 (AI 웹 검색)
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { DateTime } from "luxon";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import { config } from "../../config.js";
import { getCategory, listAllCategories } from "../../db/repositories/categories.js";
import { getPost } from "../../db/repositories/posts.js";
import { 일정목록, 일정읽기, 일정넣기, 일정고치기, 일정지우기, 단계기록들, 단계적기, type 게임일정 } from "../../db/repositories/gameEvents.js";
import { 계획짜기, 다음단계, 디데이, 디데이글, 단계들 } from "../../pipeline/출시계획.js";
import { 주문해서만들기 } from "./manualRun.js";
import { runAI } from "../../ai/run.js";
import { parseJsonLoose } from "../../claude/parseResponse.js";

const 오늘 = () => DateTime.now().setZone(config.timezone).toFormat("yyyy-MM-dd");
const 날짜꼴 = /^\d{4}-\d{2}-\d{2}$/;

function 막기(reply: FastifyReply): boolean {
  if (주인자리인가()) return false;
  reply.code(403);
  return true;
}

function 모양(e: 게임일정, 지금 = 오늘()) {
  const 계획 = 계획짜기(e.title, e.date, 지금, 단계기록들(e)).map((s) => {
    const post = s.postId ? getPost(s.postId) : null;
    return { ...s, postTitle: post?.title ?? null, postStatus: post?.status ?? null };
  });
  const d = 디데이(e.date, 지금);
  const { 지금: 할것, 다음 } = 다음단계(계획);
  return {
    id: e.id, title: e.title, kind: e.kind, date: e.date, note: e.note, source: e.source,
    categoryId: e.category_id, dday: d, ddayText: 디데이글(d),
    steps: 계획, now: 할것?.key ?? null, next: 다음 ? { key: 다음.key, 이름: 다음.이름, 시작: 다음.시작 } : null,
    doneCount: 계획.filter((s) => s.상태 === "done").length,
  };
}

/** 이 일정의 글을 쓸 카테고리 — 정한 것, 없으면 첫 카테고리. */
function 쓸카테고리(e: 게임일정) {
  return (e.category_id ? getCategory(e.category_id) : null) ?? listAllCategories()[0] ?? null;
}

export async function gameEventsRoutes(app: FastifyInstance) {
  app.get("/api/events", async (_req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const 지금 = 오늘();
    // 다 끝난 지 2주가 넘은 일정은 아래로 접는다.
    const 다 = 일정목록().map((e) => 모양(e, 지금));
    return {
      today: 지금,
      steps: 단계들.map((s) => ({ key: s.key, 이름: s.이름, 날: s.날, 창: s.창 })),
      events: 다.filter((e) => e.dday >= -14),
      past: 다.filter((e) => e.dday < -14),
    };
  });

  app.post("/api/events", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const b = (req.body ?? {}) as { title?: string; date?: string; kind?: string; categoryId?: number | null; note?: string; source?: string };
    const title = String(b.title ?? "").trim().slice(0, 40);
    if (title.length < 2) { reply.code(400); return { error: "게임 이름을 두 글자 이상 넣어 주세요." }; }
    if (!날짜꼴.test(String(b.date ?? ""))) { reply.code(400); return { error: "출시일을 골라 주세요 (예: 2026-10-20)." }; }
    const e = 일정넣기({ title, date: String(b.date), kind: b.kind, categoryId: b.categoryId ? Number(b.categoryId) : null, note: b.note ?? null, source: b.source ?? null });
    return { ok: true, event: 모양(e) };
  });

  app.put("/api/events/:id", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const id = Number((req.params as { id: string }).id);
    const b = (req.body ?? {}) as { title?: string; date?: string; kind?: string; categoryId?: number | null; note?: string };
    if (b.date !== undefined && !날짜꼴.test(String(b.date))) { reply.code(400); return { error: "날짜 꼴이 아닙니다 (YYYY-MM-DD)." }; }
    if (!일정고치기(id, { ...b, categoryId: b.categoryId === undefined ? undefined : (b.categoryId ? Number(b.categoryId) : null) })) {
      reply.code(404); return { error: "일정을 찾을 수 없습니다." };
    }
    return { ok: true, event: 모양(일정읽기(id)!) };
  });

  app.delete("/api/events/:id", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    return { ok: 일정지우기(Number((req.params as { id: string }).id)) };
  });

  app.post("/api/events/:id/steps/:k/skip", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const { id, k } = req.params as { id: string; k: string };
    const e = 일정읽기(Number(id));
    if (!e) { reply.code(404); return { error: "일정을 찾을 수 없습니다." }; }
    const 지금것 = 단계기록들(e)[k];
    if (지금것?.post_id) { reply.code(400); return { error: "이미 글을 만든 단계입니다." }; }
    단계적기(e.id, k, 지금것?.skip ? null : { skip: true, at: new Date().toISOString() });
    return { ok: true, event: 모양(일정읽기(e.id)!) };
  });

  app.post("/api/events/:id/steps/:k/generate", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const { id, k } = req.params as { id: string; k: string };
    const e = 일정읽기(Number(id));
    if (!e) { reply.code(404); return { error: "일정을 찾을 수 없습니다." }; }
    const 단계 = 계획짜기(e.title, e.date, 오늘(), 단계기록들(e)).find((s) => s.key === k);
    if (!단계) { reply.code(400); return { error: "단계는 A~F 중 하나입니다." }; }
    const category = 쓸카테고리(e);
    if (!category) { reply.code(400); return { error: "글을 쓸 카테고리가 없습니다. [블로그 관리] 에서 하나 만들어 주세요." }; }
    const 답 = await 주문해서만들기(category, {
      키워드: 단계.키워드, 각도: `${단계.이름} — ${단계.각도}`, 레인: "issue",
      이벤트: { id: e.id, step: k, title: e.title, date: e.date },
    }, reply);
    const postId = (답 as { id?: number }).id;
    if (postId) 단계적기(e.id, k, { post_id: postId, at: new Date().toISOString() });
    return 답;
  });

  /** 🔔 홈 알림 — 지금 열려 있는 단계 + 3일 안에 열릴 단계. */
  app.get("/api/events/today", async (_req, reply) => {
    if (!주인자리인가()) { reply.code(200); return { items: [] }; }
    const 지금 = 오늘();
    const 곧 = DateTime.fromISO(지금).plus({ days: 3 }).toFormat("yyyy-MM-dd");
    const items: unknown[] = [];
    for (const e of 일정목록()) {
      const 꼴 = 모양(e, 지금);
      for (const s of 꼴.steps) {
        if (s.상태 === "now") items.push({ eventId: e.id, title: e.title, ddayText: 꼴.ddayText, key: s.key, 이름: s.이름, 키워드: s.키워드, 끝: s.끝, when: "now" });
        else if (s.상태 === "upcoming" && s.시작 <= 곧) items.push({ eventId: e.id, title: e.title, ddayText: 꼴.ddayText, key: s.key, 이름: s.이름, 키워드: s.키워드, 시작: s.시작, when: "soon" });
      }
    }
    return { today: 지금, items };
  });

  /** 🔍 출시 예정 게임 찾기 — AI 가 웹 검색으로. 날짜는 사람이 한 번 확인한다. */
  app.post("/api/events/discover", async (req, reply) => {
    if (막기(reply)) return { error: 체험은못함 };
    const 이미 = 일정목록().map((e) => e.title);
    const 더 = String((req.body as { hint?: string })?.hint ?? "").trim().slice(0, 60);
    const prompt = `
오늘 날짜: ${오늘()}.
웹 검색으로, **한국에서 앞으로 45일 안에** 정식 출시(한국 서비스 시작 포함)되거나 대형 업데이트가 예정된 게임을 찾아라.
${더 ? `특히 이쪽을 먼저: ${더}\n` : ""}- 출시일(또는 업데이트일)이 **공식 발표된 것만**. 날짜가 «미정·○월 중» 이면 빼라.
- 이미 출시된 것, 이미 달력에 있는 것은 빼라: ${이미.slice(0, 30).join(", ") || "(없음)"}
- 모바일·PC·콘솔 모두. 한국 이용자 관심이 큰 순서로 최대 10개.
- 검색은 최대 4번. 확인한 것만 적어라. 지어내지 마라.

최종 답변은 다른 설명 없이 순수 JSON 하나로만:
{"games":[{"title":"게임 이름","date":"YYYY-MM-DD","kind":"release 또는 update","platform":"모바일·PC 등","source":"(매체 또는 공식, 날짜)","note":"한 줄 소개"}]}
`.trim();
    let 원문 = "";
    try {
      원문 = await runAI({ prompt, needsSearch: true, searchOnly: true, timeoutMs: 120_000 });
    } catch (탈) {
      reply.code(502);
      return { error: `출시 예정 게임을 찾지 못했습니다 — ${(탈 as Error).message}` };
    }
    const 값 = (parseJsonLoose(원문) ?? {}) as { games?: unknown[] };
    const 지금 = 오늘();
    const games = (Array.isArray(값.games) ? 값.games : [])
      .map((g) => g as Record<string, unknown>)
      .map((g) => ({
        title: String(g.title ?? "").trim().slice(0, 40), date: String(g.date ?? "").trim(),
        kind: g.kind === "update" ? "update" : "release", platform: String(g.platform ?? "").slice(0, 30),
        source: String(g.source ?? "").slice(0, 80), note: String(g.note ?? "").slice(0, 80),
      }))
      .filter((g) => g.title.length >= 2 && 날짜꼴.test(g.date) && g.date >= 지금 && !이미.includes(g.title))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 10);
    return { ok: true, games };
  });
}
