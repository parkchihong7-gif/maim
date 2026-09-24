import { DateTime } from "luxon";
import type { Category } from "../db/repositories/categories.js";
import { insertDraftPost, listRecentTitles, type Post } from "../db/repositories/posts.js";
import { markCategoryUsed } from "../db/repositories/categories.js";
import { buildPostPrompt } from "../claude/promptBuilder.js";
import { buildBlogProfileBlock } from "../claude/blogProfile.js";
import { runAI, 지금엔진, 시간초과인가 } from "../ai/run.js";
import { parsePostResponse } from "../claude/parseResponse.js";
import { getSettings, resolvePostingDirectionInstruction } from "../db/repositories/settings.js";
import type { PostDirective } from "./directives.js";
import { config } from "../config.js";
import { 최소분량 } from "../db/repositories/settings.js";

// 목표 분량(2500~4500자)에 못 미치더라도 최소한 이 정도는 되어야 재시도 없이 통과시킨다.
// 최소 분량은 **화면에서 정하신다.** 예전에는 2000 이 코드에 박혀 있어서,
// 목표가 4,000자여도 2,100자만 나오면 「기준은 넘었다」 며 통과했다.
// settings.ts 의 최소분량() 설명을 보라.

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

  const attempt = async (p: string) => {
    const 답 = await runAI({ prompt: p, needsSearch: requiresSearch });
    return parsePostResponse(답);
  };

  let parsed: Awaited<ReturnType<typeof attempt>>;
  try {
    parsed = await attempt(prompt);
  } catch (firstErr) {
    // **시간이 다 된 것은 다시 부르지 않는다.**
    //
    // 아래 재시도는 「네 답이 JSON 이 아니었다」 고 타이르는 것인데,
    // 시간 초과에는 그 말이 아무 뜻이 없다. 답이 틀린 게 아니라 아직
    // 안 온 것이기 때문이다. 그런데도 한 번 더 부르니 기다림이 곱으로
    // 늘어, 쓰시는 분은 8분을 보고 나서야 실패를 들었다.
    if (시간초과인가(firstErr)) {
      throw new Error(`[${category.name}] ${(firstErr as Error).message} `
                    + `— 뉴스형이 아닌 카테고리로 먼저 해 보시거나, `
                    + `[관리자 설정] 1단계에서 다른 모델을 적어 보십시오.`);
    }
    const retryPrompt = `${prompt}\n\n(주의: 이전 응답이 올바른 JSON 형식이 아니었다. 반드시 다른 텍스트 없이 순수 JSON 객체 하나만 출력하라.)`;
    try {
      parsed = await attempt(retryPrompt);
    } catch (secondErr) {
      // 엔진 이름을 «claude» 로 박아 두면, Gemini 를 쓰시는 분이 이 글을
      // 보고 Claude 쪽을 뒤지게 된다. 지금 쓰는 것의 이름을 적는다.
      throw new Error(`[${category.name}] ${지금엔진().label} 호출/파싱 실패: `
                    + `${(secondErr as Error).message}`);
    }
  }

  const 최소 = 최소분량();
  if (parsed.post.content.length < 최소) {
    const shortLength = parsed.post.content.length;
    // 모자란 까닭을 숫자로 못 박아 준다. 「더 길게」 만으로는 잘 안 는다.
    const lengthRetryPrompt = `${prompt}\n\n(주의: 방금 ${shortLength}자로 썼는데 `
      + `**${최소}자에 ${최소 - shortLength}자 모자란다.** 본문은 반드시 ${최소}자를 넘겨야 하며 `
      + `${directive.targetLength}자 안팎을 겨냥하라. 문단을 더 만들지 말고, 이미 쓴 각 문단에 `
      + `구체적인 사례·숫자·상황 묘사를 덧붙여 늘려라.)`;
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
    if (parsed.post.content.length < 최소) {
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
