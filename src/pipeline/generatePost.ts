import { DateTime } from "luxon";
import type { Category } from "../db/repositories/categories.js";
import { insertDraftPost, listRecentTitles, type Post } from "../db/repositories/posts.js";
import { markCategoryUsed } from "../db/repositories/categories.js";
import { buildPostPrompt, buildExpandPrompt } from "../claude/promptBuilder.js";
import { 쓸메모, 메모지문, 카테고리주소있나, 쓸블로그메모, 블로그메모적기, type 자료메모 } from "./자료메모.js";
import { 조사하기 } from "./조사.js";
import { 메모적기 } from "../db/repositories/categories.js";
import { buildBlogProfileBlock, 세부주제읽기, 주소목록읽기, 브랜드읽기 } from "../claude/blogProfile.js";
import { runAI, 지금엔진, 시간초과인가, type 부른기록 } from "../ai/run.js";
import { parsePostResponse } from "../claude/parseResponse.js";
import { 개인설정들, resolvePostingDirectionInstruction } from "../db/repositories/settings.js";
import type { PostDirective } from "./directives.js";
import { config } from "../config.js";
import { 최소분량 } from "../db/repositories/settings.js";
import { 제목고르기 } from "../claude/제목규칙.js";
import { 보관함키워드고르기 } from "../naver/보관함사용.js";
import { 키워드썼음 } from "../db/repositories/keywordPool.js";

// 목표 분량(2500~4500자)에 못 미치더라도 최소한 이 정도는 되어야 재시도 없이 통과시킨다.
// 최소 분량은 **화면에서 정하신다.** 예전에는 2000 이 코드에 박혀 있어서,
// 목표가 4,000자여도 2,100자만 나오면 「기준은 넘었다」 며 통과했다.
// settings.ts 의 최소분량() 설명을 보라.

/**
 * **글쓰기 한도.** 도구 없이 자료만 보고 쓰므로 보통 1~3분이면 끝난다.
 * 이걸 넘기면 모델이 느린 것이다 — [관리자 설정] 1단계에서 모델을 바꿔 보시라고 알린다.
 */
export const 글쓰기한도ms = 300_000;

/** 분량 보강은 여기까지 왔을 때만 한다. 넘었으면 짧은 대로 두고 5분 안에 끝낸다. */
export const 보강마감ms = 150_000;

/** 한 편을 만드는 데 무엇에 얼마나 걸렸나. 화면 상태창에 보여 준다. */
export interface 생성기록 {
  /** 조사(주소 읽기·검색) ms. 조사가 없었으면 0 */
  조사ms: number;
  /** 조사를 못 했으면 그 까닭 */
  조사실패?: string;
  /** 글쓰기(AI 부르기, 보강 포함) ms */
  글ms: number;
  /** 주소를 새로 읽었나 (참이면 메모를 새로 만들었다) */
  첫글: boolean;
  /** 남겨 둔 메모를 썼나 */
  메모씀: boolean;
  /** 다시 부른 까닭들 — "JSON", "분량" / 건너뛴 것 — "분량(시간 없어 건너뜀)" */
  다시: string[];
  /** 글을 쓴 모델 (Claude 만) */
  모델?: string;
  /** 조사에서 도구를 오간 횟수 (Claude 만) */
  조사횟수?: number;
  /** 이번 글의 키워드가 어디서 왔나 — 직접(주제 키워드 칸) / 보관함(🔎 네이버 키워드) / AI */
  키워드출처?: "직접" | "보관함" | "AI";
  /** 보관함에서 왔으면 그 키워드 */
  보관키워드?: string;
}

export function 빈기록(): 생성기록 {
  return { 조사ms: 0, 글ms: 0, 첫글: false, 메모씀: false, 다시: [] };
}

/** 카테고리 1개에 대해 조사 → 글쓰기로 draft 포스팅 1건을 생성한다. */
export async function generatePost(category: Category, directive: PostDirective, 기록: 생성기록 = 빈기록()): Promise<Post> {
  const 시작 = Date.now();

  // ── 0) 🔎 보관함 키워드 — [포스팅에 적용] 을 켠 카테고리만 ──────────
  // 네이버를 부르지 않고 미리 모아 둔 표만 읽는다. 끈 카테고리·주제 키워드를
  // 직접 적은 카테고리·보관함이 빈 카테고리는 null 이 와서 예전과 똑같다.
  // 고른 키워드는 **이 글에서만** 주제 키워드 자리에 넣는다(카테고리 칸은 그대로).
  const 보관 = 보관함키워드고르기(category);
  기록.키워드출처 = 보관 ? "보관함" : (category.topic_keyword ?? "").trim() ? "직접" : "AI";
  if (보관) {
    기록.보관키워드 = 보관.kw.keyword;
    category = { ...category, topic_keyword: 보관.kw.keyword };
  }
  const today = DateTime.now().setZone(config.timezone).toFormat("yyyy-MM-dd");
  const recentTitles = listRecentTitles(20);
  // 글 스타일은 **이 글을 만드는 자리의 것**이다. 체험 키로 만든 글은 그
  // 사람이 정한 유형·주제·말투로, 아침 자동 글은 주인의 것으로 쓴다.
  const blogSettings = 개인설정들([
    "blog_type",
    "blog_topic",
    "posting_direction_preset",
    "posting_direction_refinement",
    "blog_topics",
    "blog_links",
    "blog_brand",
  ]);
  const 참고주소들 = 주소목록읽기(blogSettings.blog_links);

  // ── 1) 조사 — 필요한 것만, 시간을 못 박아서 ──────────────────
  let 블로그메모: 자료메모 | null = 참고주소들.length ? 쓸블로그메모(blogSettings.blog_links) : null;
  let 카테고리메모: 자료메모 | null = 카테고리주소있나(category) ? 쓸메모(category) : null;
  const 블로그읽기 = 참고주소들.length > 0 && !블로그메모;
  const 카테고리읽기 = 카테고리주소있나(category) && !카테고리메모;
  const 소식찾기 = category.requires_search === 1 || !!category.topic_keyword || 카테고리주소있나(category);
  let 최근소식 = "";
  let 조사실패 = false;
  if (블로그읽기 || 카테고리읽기 || 소식찾기) {
    const 조사 = await 조사하기({
      category, today, recentTitles,
      블로그주소: 블로그읽기 ? 참고주소들 : [],
      카테고리주소읽기: 카테고리읽기,
      최근소식: 소식찾기,
    });
    기록.조사ms = 조사.ms;
    기록.조사횟수 = 조사.meta.turns;
    if (조사.실패) { 기록.조사실패 = 조사.실패; 조사실패 = true; }
    const 지금 = new Date().toISOString();
    if (블로그읽기 && 조사.블로그메모.length >= 80) {
      블로그메모적기(blogSettings.blog_links, 조사.블로그메모);
      블로그메모 = { text: 조사.블로그메모, at: 지금 };
      기록.첫글 = true;
    }
    if (카테고리읽기 && 조사.카테고리메모.length >= 80) {
      메모적기(category.id, 조사.카테고리메모, 메모지문(category));
      카테고리메모 = { text: 조사.카테고리메모, at: 지금 };
      기록.첫글 = true;
    }
    최근소식 = 조사.최근소식;
  }
  기록.메모씀 = !기록.첫글 && !!(블로그메모 || 카테고리메모);

  // ── 2) 글쓰기 — 도구 없이 자료만 보고 ─────────────────────────
  const blogProfileBlock = buildBlogProfileBlock({
    주소는메모로: true,
    blogType: blogSettings.blog_type,
    blogTopic: blogSettings.blog_topic,
    blogTopics: 세부주제읽기(blogSettings.blog_topics),
    links: 참고주소들,
    brand: 브랜드읽기(blogSettings.blog_brand),
    postingDirectionInstruction: resolvePostingDirectionInstruction(blogSettings.posting_direction_preset),
    postingDirectionRefinement: blogSettings.posting_direction_refinement,
  });
  const prompt = buildPostPrompt(category, directive, today, recentTitles, blogProfileBlock,
    { 블로그메모, 카테고리메모, 최근소식, 조사실패: 조사실패 && (소식찾기 || 블로그읽기 || 카테고리읽기),
      키워드자료: 보관?.자료 });
  const 글시작 = Date.now();
  const 다시 = 기록.다시;

  const attempt = async (p: string) => {
    const meta: 부른기록 = {};
    const 답 = await runAI({ prompt: p, timeoutMs: 글쓰기한도ms, meta });
    if (meta.model) 기록.모델 = meta.model;
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
                    + `— 글쓰기는 주소·검색 없이 자료만 보고 쓰는 단계라 보통 1~3분입니다. 이보다 오래 걸리면 `
                    + `모델이 느린 것입니다. [관리자 설정] 1단계 모델 칸에 «sonnet» 을 적어 보십시오.`);
    }
    const retryPrompt = `${prompt}\n\n(주의: 이전 응답이 올바른 JSON 형식이 아니었다. 반드시 다른 텍스트 없이 순수 JSON 객체 하나만 출력하라.)`;
    다시.push("JSON");
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
  // 분량 보강은 시간이 남을 때만 — 5분 안에 끝내는 게 먼저다. 짧으면 카드의 «글자수» 표시로 보인다.
  if (parsed.post.content.length < 최소 && Date.now() - 시작 > 보강마감ms) {
    다시.push("분량(시간 없어 건너뜀)");
    console.warn(`[${category.name}] 분량 ${parsed.post.content.length}자 < ${최소}자 — 시간이 없어 보강을 건너뜁니다.`);
  } else if (parsed.post.content.length < 최소) {
    const shortLength = parsed.post.content.length;
    // 모자란 까닭을 숫자로 못 박아 준다. 「더 길게」 만으로는 잘 안 는다.
    // **다시 조사하지 않는다** — 받은 글을 주고 늘리게만 한다(도구 없음).
    const lengthRetryPrompt = buildExpandPrompt(parsed.post, 최소, directive.targetLength);
    다시.push("분량");
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

  // 제목이 「세부 키워드 조합」 꼴을 벗어났으면, 이미 받아 둔 후보 제목 중
  // 규칙에 맞는 것으로 바꿔 끼운다. AI 를 다시 부르지 않는다 — 3분이 더 들기 때문.
  const 제목 = 제목고르기(parsed.post.title, parsed.post.title_variants, parsed.post.keyword);
  if (제목.바꿨나) {
    console.warn(
      `[${category.name}] 제목을 후보로 교체: "${parsed.post.title}" (${제목.왜}) -> "${제목.title}"`,
    );
  } else if (제목.왜) {
    console.warn(`[${category.name}] 제목이 키워드 꼴이 아니다(${제목.왜}): "${제목.title}"`);
  }

  const post = insertDraftPost({
    categoryId: category.id,
    title: 제목.title,
    content: parsed.post.content,
    imageQuery: parsed.post.image_query,
    tags: parsed.post.tags,
    titleVariants: 제목.title_variants,
  });

  markCategoryUsed(category.id);
  // 글이 나왔으니 그 키워드는 «씀» — 다음 글은 그다음 키워드로. 여기서 탈이
  // 나도 글은 이미 저장됐다. 놓치면 다음에 같은 키워드가 한 번 더 나올 뿐이다.
  if (보관) {
    try { 키워드썼음(보관.kw.id); } catch (err) { console.warn(`[보관함] «씀» 표시 실패: ${(err as Error).message}`); }
  }

  기록.글ms = Date.now() - 글시작;
  return post;
}
