import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import {
  getSettings,
  setSetting,
  getUnsplashKey,
  getPexelsKey,
  getPixabayKey,
  getAllPostingDirectionPresets,
  addCustomPreset,
  deleteCustomPreset,
  resolvePostingDirectionInstruction,
} from "../../db/repositories/settings.js";
import { runAI, 지금엔진, 엔진고르기, 엔진키, 준비됐나 } from "../../ai/run.js";
import { ENGINE_IDS, ENGINES, ENGINE_KEY_SETTINGS } from "../../ai/engines.js";
import { buildPreviewPrompt } from "../../claude/promptBuilder.js";
import { buildBlogProfileBlock } from "../../claude/blogProfile.js";
import { parsePreviewResponse } from "../../claude/parseResponse.js";

const SETTINGS_KEYS = [
  // AI 엔진마다의 API 키 (gemini_api_key 등). engines.ts 가 이름의 주인이다.
  ...ENGINE_KEY_SETTINGS,
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
    return {
      unsplash_access_key: maskSecret(getUnsplashKey()),
      unsplash_access_key_set: !!getUnsplashKey(),
      pexels_api_key: maskSecret(getPexelsKey()),
      pexels_api_key_set: !!getPexelsKey(),
      pixabay_api_key: maskSecret(getPixabayKey()),
      pixabay_api_key_set: !!getPixabayKey(),
      blog_type: raw.blog_type,
      blog_topic: raw.blog_topic,
      posting_direction_preset: raw.posting_direction_preset ?? "balanced",
      posting_direction_refinement: raw.posting_direction_refinement ?? "",
    };
  });

  app.put("/api/settings", async (req) => {
    const body = req.body as Record<string, string | null>;
    for (const key of SETTINGS_KEYS) {
      if (key in body) setSetting(key, body[key]);
    }
    return { ok: true };
  });

  // 어느 AI 를 쓰는지, 고를 수 있는 것은 무엇인지.
  app.get("/api/settings/ai", async () => {
    const 지금 = 지금엔진();
    return {
      current: 지금.id,
      ready: 준비됐나(지금),
      // 안내 명령에 저장통 이름을 **미리 박아서** 내보낸다. 「YOUR_PROJECT_ID
      // 를 본인 것으로 바꾸세요」 가 여태 제일 많이 틀리던 자리였다.
      bucket: config.gcsStateBucket,
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
          key: maskSecret(엔진키(e) || null),
        };
      }),
    };
  });

  app.put("/api/settings/ai", async (req, reply) => {
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
  app.post("/api/settings/test-claude", async () => {
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

  app.post("/api/settings/preview-post", async (_req, reply) => {
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
    const { id } = req.params as { id: string };
    if (!id.startsWith("custom_")) {
      reply.code(403);
      return { error: "기본 제공 프리셋은 삭제할 수 없습니다." };
    }
    deleteCustomPreset(id);
    return { ok: true };
  });
}
