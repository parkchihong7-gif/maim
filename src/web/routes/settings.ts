import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { 주인자리인가, 체험은못함 } from "../../tenancy.js";
import {
  getSettings,
  setSetting,
  getUnsplashKey,
  getPexelsKey,
  getPixabayKey,
  최소분량, 최소분량정하기, 최소분량최저, 최소분량최고,
  getAllPostingDirectionPresets,
  addCustomPreset,
  deleteCustomPreset,
  resolvePostingDirectionInstruction,
} from "../../db/repositories/settings.js";
import { runAI, 지금엔진, 엔진고르기, 엔진키, 엔진모델, 준비됐나 } from "../../ai/run.js";
import { ENGINE_IDS, ENGINES, ENGINE_KEY_SETTINGS, ENGINE_MODEL_SETTINGS, 키검사 } from "../../ai/engines.js";
import { buildPreviewPrompt } from "../../claude/promptBuilder.js";
import { buildBlogProfileBlock } from "../../claude/blogProfile.js";
import { parsePreviewResponse } from "../../claude/parseResponse.js";

const SETTINGS_KEYS = [
  // AI 엔진마다의 API 키 (gemini_api_key 등). engines.ts 가 이름의 주인이다.
  ...ENGINE_KEY_SETTINGS,
  // 어느 모델로 쓸지 (gemini_model 등). 비워 두면 도구 기본값.
  ...ENGINE_MODEL_SETTINGS,
  "unsplash_access_key",
  "pexels_api_key",
  "pixabay_api_key",
  "blog_type",
  "blog_topic",
  "posting_direction_preset",
  "posting_direction_refinement",
];

/** 앞 4자만 보여주고 나머지는 가려서 "이미 설정돼 있다"만 확인 가능하게 한다. */
function maskSecret(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 4) return "••••";
  return `${value.slice(0, 4)}${"•".repeat(Math.min(value.length - 4, 12))}`;
}

export async function settingsRoutes(app: FastifyInstance) {
  app.get("/api/settings", async () => {
    const raw = getSettings(SETTINGS_KEYS);
    // 가려 놓았어도 앞 네 자는 보인다. 체험 회원에게 보일 것이 아니다.
    const 주인 = 주인자리인가();
    const 가림 = (값: string | null) => (주인 ? maskSecret(값) : null);
    return {
      unsplash_access_key: 가림(getUnsplashKey()),
      unsplash_access_key_set: !!getUnsplashKey(),
      pexels_api_key: 가림(getPexelsKey()),
      pexels_api_key_set: !!getPexelsKey(),
      pixabay_api_key: 가림(getPixabayKey()),
      pixabay_api_key_set: !!getPixabayKey(),
      min_length: 최소분량(),
      min_length_min: 최소분량최저,
      min_length_max: 최소분량최고,
      blog_type: raw.blog_type,
      blog_topic: raw.blog_topic,
      posting_direction_preset: raw.posting_direction_preset ?? "balanced",
      posting_direction_refinement: raw.posting_direction_refinement ?? "",
    };
  });

  app.put("/api/settings", async (req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const body = req.body as Record<string, string | null>;

    // AI 키는 **저장하기 전에** 본다. 잘못된 것이 들어가면 나중에
    // 「연결 테스트」 에서 알아보기 어려운 영문 오류로만 나타난다.
    for (const key of ENGINE_KEY_SETTINGS) {
      const 값 = body[key];
      if (!(key in body) || 값 === null || 값 === "") continue;
      const 탈 = 키검사(String(값));
      if (탈) { reply.code(400); return { error: 탈 }; }
    }

    // 글자수는 숫자이고 범위가 있어서 따로 받는다.
    let 분량알림 = "";
    if ("min_length" in body && body.min_length !== null) {
      if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
      const 넣은것 = Number(body.min_length);
      if (!Number.isFinite(넣은것)) { reply.code(400); return { error: "최소 글자수는 숫자여야 합니다." }; }
      const 맞춘 = 최소분량정하기(넣은것);
      if (맞춘 !== Math.floor(넣은것)) {
        분량알림 = `최소 글자수는 ${최소분량최저}~${최소분량최고} 사이라 ${맞춘}자로 맞췄습니다.`;
      }
    }

    for (const key of SETTINGS_KEYS) {
      if (key in body) setSetting(key, body[key]);
    }
    return 분량알림 ? { ok: true, notice: 분량알림, min_length: 최소분량() }
                   : { ok: true, min_length: 최소분량() };
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
      roleLabel: 주인 ? "판매용 (주인)" : "체험용",
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
    try {
      await runAI({
        prompt: "연결 테스트다. 다른 설명 없이 'ok'라고만 답하라.",
        timeoutMs: 30_000,
      });
      return { ok: true, engine: 지금엔진().label };
    } catch (err) {
      return { ok: false, engine: 지금엔진().label, error: (err as Error).message };
    }
  });

  // 미리보기도 글 한 편을 진짜로 쓴다. 체험 하루 3건 셈에도 안 잡히는
  // 자리라, 여기로 사장님 한도가 새면 막을 길이 없다.
  app.post("/api/settings/preview-post", async (_req, reply) => {
    if (!주인자리인가()) { reply.code(403); return { error: 체험은못함 }; }
    const raw = getSettings(SETTINGS_KEYS);
    const blogProfileBlock = buildBlogProfileBlock({
      blogType: raw.blog_type,
      blogTopic: raw.blog_topic,
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
