import { DateTime } from "luxon";
import type { Category } from "../db/repositories/categories.js";
import { insertDraftPost, listRecentTitles, type Post } from "../db/repositories/posts.js";
import { markCategoryUsed } from "../db/repositories/categories.js";
import { buildPostPrompt } from "../claude/promptBuilder.js";
import { buildBlogProfileBlock } from "../claude/blogProfile.js";
import { runClaude } from "../claude/runClaude.js";
import { parsePostResponse } from "../claude/parseResponse.js";
import { getSettings, resolvePostingDirectionInstruction } from "../db/repositories/settings.js";
import type { PostDirective } from "./directives.js";
import { config } from "../config.js";

// 목표 분량(2500~4500자)에 못 미치더라도 최소한 이 정도는 되어야 재시도 없이 통과시킨다.
const MIN_ACCEPTABLE_LENGTH = 2000;

/** 카테고리 1개에 대해 claude -p를 호출해 draft 포스팅 1건을 생성한다. */
export async function generatePost(category: Category, directive: PostDirective): Promise<Post> {
  const today = DateTime.now().setZone(config.timezone).toFormat("yyyy-MM-dd");
  const recentTitles = listRecentTitles(20);
  const blogSettings = getSettings([
    "blog_type",
    "blog_topic",
    "posting_direction_preset",
    "posting_direction_refinement",
  ]);
  const blogProfileBlock = buildBlogProfileBlock({
    blogType: blogSettings.blog_type,
    blogTopic: blogSettings.blog_topic,
    postingDirectionInstruction: resolvePostingDirectionInstruction(blogSettings.posting_direction_preset),
    postingDirectionRefinement: blogSettings.posting_direction_refinement,
  });
  const prompt = buildPostPrompt(category, directive, today, recentTitles, blogProfileBlock);

  const requiresSearch = category.requires_search === 1;
  const allowedTools = requiresSearch ? ["WebSearch"] : undefined;
  const noTools = !requiresSearch;

  const attempt = async (p: string) => {
    const envelope = await runClaude({ prompt: p, allowedTools, noTools, timeoutMs: 240_000 });
    if (envelope.is_error) {
      throw new Error(`claude -p 응답 오류: ${envelope.result}`);
    }
    return parsePostResponse(envelope.result);
  };

  let parsed: Awaited<ReturnType<typeof attempt>>;
  try {
    parsed = await attempt(prompt);
  } catch (firstErr) {
    const retryPrompt = `${prompt}\n\n(주의: 이전 응답이 올바른 JSON 형식이 아니었다. 반드시 다른 텍스트 없이 순수 JSON 객체 하나만 출력하라.)`;
    try {
      parsed = await attempt(retryPrompt);
    } catch (secondErr) {
      throw new Error(`[${category.name}] claude -p 호출/파싱 실패: ${(secondErr as Error).message}`);
    }
  }

  if (parsed.post.content.length < MIN_ACCEPTABLE_LENGTH) {
    const shortLength = parsed.post.content.length;
    const lengthRetryPrompt = `${prompt}\n\n(주의: 방금 ${shortLength}자로 너무 짧게 작성했다. 각 섹션의 설명과 구체적인 사례를 더 풍부하게 확장해서 반드시 ${directive.targetLength}자 안팎 분량으로 다시 작성하라.)`;
    try {
      const retryParsed = await attempt(lengthRetryPrompt);
      console.warn(
        `[${category.name}] 분량 보강 재시도: ${shortLength}자 -> ${retryParsed.post.content.length}자`,
      );
      if (retryParsed.post.content.length > shortLength) {
        parsed = retryParsed;
      }
    } catch (retryErr) {
      console.warn(
        `[${category.name}] 분량 보강 재시도 실패(${(retryErr as Error).message}), 원본(${shortLength}자) 그대로 사용`,
      );
    }
    if (parsed.post.content.length < MIN_ACCEPTABLE_LENGTH) {
      console.warn(
        `[${category.name}] 재시도 후에도 목표 분량 미달: ${parsed.post.content.length}자 (목표 ${directive.targetLength}자)`,
      );
    }
  }

  if (parsed.warnings.length > 0) {
    console.warn(`[${category.name}] 스타일 규칙 위반 감지 및 자동 제거:`, parsed.warnings);
  }

  const post = insertDraftPost({
    categoryId: category.id,
    title: parsed.post.title,
    content: parsed.post.content,
    imageQuery: parsed.post.image_query,
    tags: parsed.post.tags,
    titleVariants: parsed.post.title_variants,
  });

  markCategoryUsed(category.id);
  return post;
}
