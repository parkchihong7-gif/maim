import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { 주인자리인가, 체험은못함, 체험_하루상한 } from "../../tenancy.js";
import { 네이버키, 네이버키검사, 네이버키칸 } from "../../naver/키.js";
import {
  setSetting,
  getUnsplashKey,
  getPexelsKey,
  getPixabayKey,
  최소분량, 최소분량정하기, 최소분량최저, 최소분량최고,
  개인설정들, 개인설정정하기, 개인설정인가, 개인설정_최대글자,
  getAllPostingDirectionPresets,
  addCustomPreset,
  deleteCustomPreset,
  resolvePostingDirectionInstruction,
} from "../../db/repositories/settings.js";
import { runAI, 지금엔진, 엔진고르기, 엔진키, 엔진모델, 준비됐나, 상태지우기, 상태적기, 지금상태 } from "../../ai/run.js";
import { ENGINE_IDS, ENGINES, ENGINE_KEY_SETTINGS, ENGINE_MODEL_SETTINGS, 키검사 } from "../../ai/engines.js";
import { buildPreviewPrompt } from "../../claude/promptBuilder.js";
import {
  buildBlogProfileBlock, findBlogTopicLabel, BUSINESS_INDUSTRY_GROUPS, 세부업종이름, LINK_KINDS, BLOG_TOPIC_GROUPS, 세부주제_최대, 주소_최대,
  세부주제다듬기, 세부주제읽기, 주소목록다듬기, 주소목록읽기, 브랜드다듬기, 브랜드읽기,
} from "../../claude/blogProfile.js";
import { parsePreviewResponse } from "../../claude/parseResponse.js";
import { 시간재보기 } from "../../scheduler/시간예상.js";
import { 지금상한 } from "../../scheduler/예약.js";

/** 자리마다 따로 두는 글 스타일 칸. 체험 회원이 바꿀 수 있는 것은 이것뿐이다. */
const STYLE_KEYS = [
  "blog_type",
  "blog_topic",
  "posting_direction_preset",
  "posting_direction_refinement",
  "blog_topics",
  "blog_links",
  "blog_brand",
] as const;

/** 체험 회원에게 막을 때 하는 말. 무엇은 되는지까지 말해 준다. */
const 체험은스타일만 =
  "체험 키로는 [2) 블로그 주제 설정]과 [3) 포스팅 방향 설정]만 바꾸실 수 있습니다. "
  + "AI 연결·이미지 키·아침 예약은 서버 주인이 관리합니다.";

const SETTINGS_KEYS = [
  // AI 엔진마다의 API 키 (gemini_api_key 등). engines.ts 가 이름의 주인이다.
  ...ENGINE_KEY_SETTINGS,
  // 어느 모델로 쓸지 (gemini_model 등). 비워 두면 도구 기본값.
  ...ENGINE_MODEL_SETTINGS,
  "unsplash_access_key",
  "pexels_api_key",
  "pixabay_api_key",
  // 네이버 키워드 키 다섯 개. 주인만 (개인설정이 아니라 체험 PUT 은 403).
  ...네이버키칸,
  ...STYLE_KEYS,
];

/** 앞 4자만 보여주고 나머지는 가려서 "이미 설정돼 있다"만 확인 가능하게 한다. */
function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 4, 12))}`;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => {
    // 가려 놓았어도 앞 네 자는 보인다. 체험 회원에게 보일 것이 아니다.
    const 주인 = 주인자리인가();
    // 글 스타일은 **지금 들어온 자리의 것**이다. 체험 회원에게 사장님
    // 블로그 주제를 보여 주면, 제 것인 줄 알고 그대로 두게 된다.
    const raw = 개인설정들(STYLE_KEYS);
    const 가림 = (값: string | null) => (주인 ? maskSecret(값) : null);
    return {
      unsplash_access_key: 가림(getUnsplashKey()),
      unsplash_access_key_set: !!getUnsplashKey(),
      pexels_api_key: 가림(getPexelsKey()),
      pexels_api_key_set: !!getPexelsKey(),
      pixabay_api_key: 가림(getPixabayKey()),
      pixabay_api_key_set: !!getPixabayKey(),
      // 네이버 키워드 키. 체험 자리에는 값도, 있는지 여부도 보이지 않는다.
      naver: Object.fromEntries(네이버키칸.map((칸) => {
        const 값 = 네이버키(칸);
        return [칸, { set: 주인 ? !!값 : false, value: 가림(값) }];
      })),
      // 화면이 «이 자리에서 무엇을 바꿀 수 있나» 를 이걸로 가른다.
      seat: 주인 ? "owner" : "trial",
      // 체험 회원이 자기 스타일을 한 번이라도 정했는가. 안 정했으면 화면이
      // 들어오자마자 「내 글 스타일」 을 먼저 연다 — 안내 메일은 대충 읽혀도
      // 첫 화면은 반드시 보인다.
      style_saved: 주인 ? true : STYLE_KEYS.some((k) => raw[k] !== null && raw[k] !== undefined),
      trial_daily_limit: 주인 ? null : 체험_하루상한,
      min_length: 최소분량(),
      // 지금 값으로 아침에 몇 분 걸릴지. 화면이 그 자리에서 경고한다.
      // 아침 예약은 주인 자리만 돈다 — 체험 회원에게는 해당이 없는 경고다.
      timing: 주인 ? 시간재보기(최소분량(), 지금상한()) : null,
      min_length_min: 최소분량최저,
      min_length_max: 최소분량최고,
      blog_type: raw.blog_type,
      blog_topic: raw.blog_topic,
      posting_direction_preset: raw.posting_direction_preset ?? "balanced",
      posting_direction_refinement: raw.posting_direction_refinement ?? "",
      // 블로그 정보. 화면이 칩·주소 줄·회사 칸을 그린다.
      blog_topics: 세부주제읽기(raw.blog_topics),
      // 옛 드롭다운으로 고른 주제의 이름. 아직 칩을 안 고르셨으면 화면이 이것을 첫 칩으로 띄운다.
      blog_topic_label: findBlogTopicLabel(raw.blog_topic ?? ""),
      blog_links: 주소목록읽기(raw.blog_links),
      blog_brand: 브랜드읽기(raw.blog_brand),
      // 칩 목록. 묶음마다 [묶음 칩(있으면)] + [세부 칩]. value 가 저장되는 이름, label 이 칩에 보이는 말.
      blog_catalog: {
        personal: BLOG_TOPIC_GROUPS.map((g) => ({
          group: g.group, groupValue: null,
          items: g.topics.map((x) => ({ value: x.label, label: x.label })),
        })),
        business: BUSINESS_INDUSTRY_GROUPS.map((g) => ({
          group: g.group, groupValue: g.group,
          items: g.subs.map((s) => ({ value: 세부업종이름(g.short, s), label: s })),
        })),
        linkKinds: LINK_KINDS,
        maxTopics: 세부주제_최대,
        maxLinks: 주소_최대,
      },
    };
  });

  app.put("/api/settings", async (req, reply) => {
    const 주인 = 주인자리인가();
    const body = (req.body ?? {}) as Record<string, string | null>;

    // 체험 회원은 **글 스타일 칸만** 바꿀 수 있다. 하나라도 다른 칸이
    // 섞여 오면 통째로 돌려보낸다 — 반만 저장되면 화면과 서버가 어긋난다.
    if (!주인) {
      const 막힌칸 = Object.keys(body).filter((k) => !개인설정인가(k));
      if (막힌칸.length > 0) { reply.code(403); return { error: 체험은스타일만 }; }
    }

    // 블로그 정보는 JSON 으로 받는다. 이상한 값은 다듬어서(버릴 것은 버리고) 저장한다.
    if ("blog_topics" in body) body.blog_topics = 세부주제다듬기(body.blog_topics);
    if ("blog_links" in body) body.blog_links = 주소목록다듬기(body.blog_links);
    if ("blog_brand" in body) body.blog_brand = 브랜드다듬기(body.blog_brand);

    const 보강 = body.posting_direction_refinement;
    if (typeof 보강 === "string" && 보강.length > 개인설정_최대글자) {
      reply.code(400);
      return { error: `보강 내용은 ${개인설정_최대글자.toLocaleString()}자까지 적으실 수 있습니다 (지금 ${보강.length.toLocaleString()}자).` };
    }

    // AI 키는 **저장하기 전에** 본다. 잘못된 것이 들어가면 나중에
    // 「연결 테스트」 에서 알아보기 어려운 영문 오류로만 나타난다.
    for (const key of ENGINE_KEY_SETTINGS) {
      const 값 = body[key];
      if (!(key in body) || 값 === null || 값 === "") continue;
      const 탈 = 키검사(String(값));
      if (탈) { reply.code(400); return { error: 탈 }; }
    }

    // 네이버 키도 저장하기 전에 본다. 칸마다 길이가 달라 따로 검사한다.
    for (const key of 네이버키칸) {
      const 값 = body[key];
      if (!(key in body) || 값 === null || 값 === "") continue;
      const 탈 = 네이버키검사(key, String(값));
      if (탈) { reply.code(400); return { error: 탈 }; }
      body[key] = String(값).trim();
    }

    // 글자수는 숫자이고 범위가 있어서 따로 받는다.
    let 분량알림 = "";
    if ("min_length" in body && body.min_length !== null) {
      const 넣은것 = Number(body.min_length);
      if (!Number.isFinite(넣은것)) { reply.code(400); return { error: "최소 글자수는 숫자여야 합니다." }; }
      const 맞춘 = 최소분량정하기(넣은것);
      if (맞춘 !== Math.floor(넣은것)) {
        분량알림 = `최소 글자수는 ${최소분량최저}~${최소분량최고} 사이라 ${맞춘}자로 맞췄습니다.`;
      }
    }

    for (const key of SETTINGS_KEYS) {
      if (!(key in body)) continue;
      // 스타일 칸은 자리별로, 나머지는 서버 하나에 하나.
      if (개인설정인가(key)) 개인설정정하기(key, body[key]);
      else setSetting(key, body[key]);
    }
    // AI 키·모델이 바뀌면 전의 «연결됨/끊김» 은 더 이상 맞지 않다.
    if ([...ENGINE_KEY_SETTINGS, ...ENGINE_MODEL_SETTINGS].some((k) => k in body)) 상태지우기();
    const 어림 = 주인 ? 시간재보기(최소분량(), 지금상한()) : null;
    return 분량알림 ? { ok: true, notice: 분량알림, min_length: 최소분량(), timing: 어림 }
                   : { ok: true, min_length: 최소분량(), timing: 어림 };
  });

  // 어느 AI 를 쓰는지, 고를 수 있는 것은 무엇인지.
  app.get("/api/settings/ai", async () => {
    const 지금 = 지금엔진();
    const 주인 = 주인자리인가();
    return {
      current: 지금.id,
      ready: 준비됐나(지금),
      // 화면이 «바꿀 수 있는 자리인가» 를 알아야 단추를 감춘다.
      canChange: 주인,
      // **지금 어느 자격으로 들어와 계신지 화면에 보인다.**
      //
      // 주인이 체험으로 몰려 제 설정에서 쫓겨난 적이 있다. 그때 화면에는
      // 「체험 키로는 바꿀 수 없습니다」 만 떴고, 왜 내가 체험인지는
      // 어디에도 없었다. 보이면 그 자리에서 알아차린다.
      role: 주인 ? "admin" : "client",
      // 주인은 사이드바에 자격 글자를 띄우지 않는다(사장님 요청 10-03). 체험만 «체험용».
      roleLabel: 주인 ? "" : "체험용",
      // 안내 명령에 저장통 이름을 **미리 박아서** 내보낸다. 「YOUR_PROJECT_ID
      // 를 본인 것으로 바꾸세요」 가 여태 제일 많이 틀리던 자리였다.
      bucket: 주인 ? config.gcsStateBucket : "",
      engines: ENGINE_IDS.map((id) => {
        const e = ENGINES[id];
        return {
          id: e.id, label: e.label, cost: e.cost,
          install: e.install, login: e.login, home: e.home,
          // 화면이 «검은 창 두 줄» 을 보일지 «키 한 칸» 을 보일지
          // 가르는 값이다. Gemini 만 거짓이다.
          loginWorksOnServer: e.auth.loginWorksOnServer,
          keyUrl: e.auth.keyUrl,
          keyHow: e.auth.keyHow,
          settingKey: e.auth.settingKey,
          keySet: !!엔진키(e),
          modelSetting: e.modelSetting,
          canChangeModel: 주인,
          modelHint: e.modelHint,
          model: 엔진모델(e),
          key: 주인 ? maskSecret(엔진키(e) || null) : null,
        };
      }),
    };
  });

  app.put("/api/settings/ai", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const { engine } = (req.body ?? {}) as { engine?: string };
    try {
      const 것 = 엔진고르기(String(engine));
      return { ok: true, current: 것.id };
    } catch (탈) {
      reply.code(400);
      return { error: (탈 as Error).message };
    }
  });

  // 실제로 한 번 불러 보는 것이라 사용자가 버튼을 눌렀을 때만 실행한다.
  // 이것도 사장님 AI 한도를 쓴다. 체험 회원이 누를 자리가 아니다.
  app.post("/api/settings/test-claude", async (_req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { ok: false, error: 체험은못함 }; }
    const 준비 = 준비됐나();
    if (!준비.ok) return { ok: false, engine: 지금엔진().label, error: 준비.why };
    // 시험하는 사이 AI 가 바뀔 수 있다. 시험한 엔진 이름으로 적어야 한다.
    const 시험엔진 = 지금엔진().id;
    try {
      await runAI({
        prompt: "연결 테스트다. 다른 설명 없이 'ok'라고만 답하라.",
        timeoutMs: 30_000,
        // 방금 검은 창에서 새로 로그인해 올리셨을 수 있다. 지금 받아 온다.
        freshLogin: true,
      });
      return { ok: true, engine: 지금엔진().label, status: 지금상태() };
    } catch (err) {
      // 연결 테스트가 실패했으면 그게 곧 «끊김» 이다. 글쓰기를 막아 둔다.
      상태적기(false, (err as Error).message, 시험엔진);
      return { ok: false, engine: 지금엔진().label, error: (err as Error).message, status: 지금상태() };
    }
  });

  // 미리보기도 글 한 편을 진짜로 쓴다. 체험 하루 3건 셈에도 안 잡히는
  // 자리라, 여기로 사장님 한도가 새면 막을 길이 없다.
  app.post("/api/settings/preview-post", async (_req, reply) => {
    if (!주인자리인가()) {
      reply.code(403);
      return { error: `체험 키로는 예시 포스팅을 볼 수 없습니다. [포스팅]에서 글을 직접 만들어 보세요 (하루 ${체험_하루상한}건).` };
    }
    const raw = 개인설정들(STYLE_KEYS);
    const blogProfileBlock = buildBlogProfileBlock({
      blogType: raw.blog_type,
      blogTopic: raw.blog_topic,
      blogTopics: 세부주제읽기(raw.blog_topics),
      links: 주소목록읽기(raw.blog_links),
      brand: 브랜드읽기(raw.blog_brand),
      postingDirectionInstruction: resolvePostingDirectionInstruction(raw.posting_direction_preset),
      postingDirectionRefinement: raw.posting_direction_refinement,
    });
    const directive = {
      openingStyle: "greeting" as const,
      tension: "casual" as const,
      persona: "친한 친구에게 수다 떨듯 편하게 쓰는 일상 블로거",
      targetLength: 900,
      sectionCount: 2,
    };
    const prompt = buildPreviewPrompt(directive, blogProfileBlock);

    try {
      const 답 = await runAI({ prompt, timeoutMs: 120_000 });
      const preview = parsePreviewResponse(답);
      return preview;
    } catch (err) {
      reply.code(502);
      return { error: `미리보기 생성 실패: ${(err as Error).message}` };
    }
  });

  app.get("/api/settings/posting-direction-presets", async () => {
    return getAllPostingDirectionPresets();
  });

  app.post("/api/settings/posting-direction-presets", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const body = req.body as { label?: string; description?: string; instruction?: string };
    const label = (body.label || "").trim();
    const instruction = (body.instruction || "").trim();
    if (!label || !instruction) {
      reply.code(400);
      return { error: "이름과 AI 지시문은 필수입니다." };
    }
    const preset = addCustomPreset({
      label,
      description: (body.description || "").trim() || "사용자가 추가한 프리셋",
      instruction,
    });
    reply.code(201);
    return preset;
  });

  app.delete("/api/settings/posting-direction-presets/:id", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const { id } = req.params as { id: string };
    if (!id.startsWith("custom_")) {
      reply.code(403);
      return { error: "기본 제공 프리셋은 삭제할 수 없습니다." };
    }
    deleteCustomPreset(id);
    return { ok: true };
  });
}
