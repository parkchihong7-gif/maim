import type { FastifyInstance } from "fastify";
import { getSettings, setSetting, getUnsplashKey, getPexelsKey } from "../../db/repositories/settings.js";
import { runClaude } from "../../claude/runClaude.js";
import { buildPreviewPrompt } from "../../claude/promptBuilder.js";
import { buildBlogProfileBlock, POSTING_DIRECTION_PRESETS } from "../../claude/blogProfile.js";
import { parsePreviewResponse } from "../../claude/parseResponse.js";

const SETTINGS_KEYS = [
  "unsplash_access_key",
  "pexels_api_key",
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

  // 실제 비용이 발생하는 claude -p 호출이므로 사용자가 버튼을 눌렀을 때만 실행한다.
  app.post("/api/settings/test-claude", async () => {
    try {
      const envelope = await runClaude({
        prompt: "연결 테스트다. 다른 설명 없이 'ok'라고만 답하라.",
        noTools: true,
        timeoutMs: 30_000,
      });
      if (envelope.is_error) {
        return { ok: false, error: envelope.result };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  app.post("/api/settings/preview-post", async (_req, reply) => {
    const raw = getSettings(SETTINGS_KEYS);
    const blogProfileBlock = buildBlogProfileBlock({
      blogType: raw.blog_type,
      blogTopic: raw.blog_topic,
      postingDirectionPreset: raw.posting_direction_preset,
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
      const envelope = await runClaude({ prompt, noTools: true, timeoutMs: 120_000 });
      if (envelope.is_error) {
        reply.code(502);
        return { error: `미리보기 생성 실패: ${envelope.result}` };
      }
      const preview = parsePreviewResponse(envelope.result);
      return preview;
    } catch (err) {
      reply.code(502);
      return { error: `미리보기 생성 실패: ${(err as Error).message}` };
    }
  });

  app.get("/api/settings/posting-direction-presets", async () => {
    return Object.entries(POSTING_DIRECTION_PRESETS).map(([id, preset]) => ({ id, ...preset }));
  });
}
