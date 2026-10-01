/**
 * **조사 — 글을 쓰기 전에 자료만 모으는 짧은 단계. 시간을 못 박는다.**
 *
 * 예전에는 글을 쓰는 한 번의 부름 안에서 AI 가 알아서 주소를 열고 검색했다.
 * 그러면 몇 번을 열지 아무도 정하지 않는다. 네이버 블로그(겉틀 안에 글이 든
 * 구조)·인스타그램·유튜브처럼 잘 안 열리는 곳에서 AI 가 이리저리 다시 시도하다
 * 10분을 넘겨 글 자체가 실패했다.
 *
 * 그래서 둘로 나눈다.
 *   1) 조사 (여기)   도구를 켜고, 횟수를 정해 주고, 시간을 못 박는다(120초 / 75초).
 *                    시간이 다 되면 **조사 없이 글로 넘어간다** — 글은 나온다.
 *   2) 글쓰기        도구 없이, 여기서 모은 자료와 메모만 보고 쓴다.
 *
 * 읽을 것은 필요한 만큼만 시킨다.
 *   - 블로그 참고 주소: 블로그 메모가 없을 때만 (자리에 하나, 모든 카테고리가 같이 씀)
 *   - 카테고리 주소:    그 카테고리의 메모가 없을 때만
 *   - 최근 소식:        뉴스형이거나 주제 키워드·카테고리 주소가 있을 때 — 검색만
 */
import type { Category } from "../db/repositories/categories.js";
import type { BlogLink } from "../claude/blogProfile.js";
import { LINK_KINDS } from "../claude/blogProfile.js";
import { runAI, type 부른기록 } from "../ai/run.js";
import { parseJsonLoose } from "../claude/parseResponse.js";

/** 주소를 읽어야 할 때의 시간 한도. (시험에서 줄이려고 환경변수로도 받는다) */
export const 읽기한도ms = Number(process.env.RESEARCH_READ_TIMEOUT_MS) || 120_000;
/** 최근 소식만 찾을 때의 시간 한도. */
export const 소식한도ms = Number(process.env.RESEARCH_NEWS_TIMEOUT_MS) || 75_000;

export interface 조사주문 {
  category: Category;
  today: string;
  /** 블로그 메모가 없을 때만 — 읽을 블로그 참고 주소 */
  블로그주소?: BlogLink[];
  /** 카테고리 메모가 없을 때만 — 참이면 그 카테고리의 대표·참고 주소를 읽는다 */
  카테고리주소읽기?: boolean;
  /** 최근 소식을 찾을까 */
  최근소식?: boolean;
  /** 이미 쓴 글 제목 — 소식을 고를 때 겹치지 않게 */
  recentTitles?: string[];
}

export interface 조사결과 {
  블로그메모: string;
  카테고리메모: string;
  최근소식: string;
  /** 조사를 못 했으면 그 까닭 (시간 초과 등). 글은 그래도 쓴다. */
  실패: string;
  ms: number;
  meta: 부른기록;
}

/** 조사 지시문. 시험에서 들여다보려고 따로 둔다. */
export function buildResearchPrompt(주문: 조사주문): string {
  const c = 주문.category;
  const 함께 = (c.must_keywords ?? "").trim();
  const 빼기 = (c.exclude_keywords ?? "").trim();
  const 대표 = (c.main_url ?? "").trim();
  const 참고 = (c.reference_urls ?? "").split(/\s+/).filter(Boolean);
  const 블로그 = (주문.블로그주소 ?? []).filter((l) => l?.url);
  const 할일: string[] = [];

  if (블로그.length) {
    할일.push(`■ blog_brief — 이 블로그의 참고 주소를 열어, 이 블로그가 실제로 다루는 소재·용어·말투·상품·서비스 정보를
  400~800자 짧은 줄로 정리하라.
${블로그.map((l) => `  - (${LINK_KINDS[l.kind] ?? "기타"}) ${l.url}${l.note ? ` — ${l.note}` : ""}`).join("\n")}`);
  }
  if (주문.카테고리주소읽기 && (대표 || 참고.length)) {
    할일.push(`■ brief — 이 카테고리의 주소를 열어 다음 글들의 기본 바탕을 600~1000자 짧은 줄로 정리하라:
  출처별 핵심 사실·숫자(날짜 포함, «(출처) 내용» 꼴), 이 카테고리가 다룰 만한 소재 5~8개, 독자층.${대표 ? `
  - 대표 주소(가장 먼저): ${대표}` : ""}${참고.length ? `
  - 참고 주소: ${참고.join(" · ")}` : ""}`);
  }
  if (주문.최근소식) {
    const 키 = (c.topic_keyword ?? "").trim();
    할일.push(`■ news — 웹 검색으로 ${키 ? `주제 키워드 «${키}» 와 관련된` : "이 카테고리의"} 최근(대략 2주 안) 소식 3~5개를
  «(날짜, 매체) 한 줄 요약» 꼴로 적어라. 대중의 관심이 가장 큰 것을 맨 위에.${키 ? `
  키워드는 카테고리 「${c.name}」 (${c.prompt_hint}) 의 맥락으로만 해석하라 — 같은 글자의 다른 뜻이면 버려라.${함께 ? `
  검색어는 «${키} + 함께 들어갈 말(${함께}) 중 하나» 조합으로 만들어라. 키워드만 단독으로 검색하지 마라.` : ""}` : ""}${빼기 ? `
  빼야 할 말(다른 뜻): ${빼기} — 이 말이 들어간 결과는 버려라.` : ""}${(주문.recentTitles ?? []).length ? `
  이미 쓴 글과 겹치는 소식은 뒤로 미뤄라: ${(주문.recentTitles ?? []).slice(0, 8).join(" / ")}` : ""}`);
  }

  return `
오늘 날짜: ${주문.today}.
블로그 글을 쓰기 전에 **자료만 빠르게** 모아라. 글은 쓰지 마라.
카테고리: 「${c.name}」 — ${c.prompt_hint}

[할 일]
${할일.join("\n\n")}

[시간 규칙 — 반드시 지켜라. 이 단계는 2분 안에 끝나야 한다]
- 주소 열기는 모두 합쳐 **최대 4번**, 웹 검색은 **최대 3번**.
- 인스타그램·유튜브·페이스북·틱톡처럼 로그인해야 보이는 곳은 **열지 마라.** 주소와 계정 이름만 참고하라.
- 네이버 블로그가 내용 없이 열리면 m.blog.naver.com 주소로 **한 번만** 다시 열어 보고, 그래도 안 되면 넘어가라.
- 한 번 실패한 주소는 다시 열지 마라. 링크를 줄줄이 따라가지 마라.
- 확인한 것만 적어라. 지어내지 마라. 문장은 베끼지 말고 요점만.

최종 답변은 다른 설명 없이 순수 JSON 하나로만 출력하라 (할 일에 없는 칸은 빈 글자):
{"blog_brief": "", "brief": "", "news": ""}
`.trim();
}

/** 조사를 한다. 시간이 다 되거나 실패해도 던지지 않고, 빈 자료와 까닭을 돌려준다. */
export async function 조사하기(주문: 조사주문): Promise<조사결과> {
  const 주소읽기 = (주문.블로그주소 ?? []).length > 0 || !!주문.카테고리주소읽기;
  const meta: 부른기록 = {};
  const 시작 = Date.now();
  const 빈것 = { 블로그메모: "", 카테고리메모: "", 최근소식: "" };
  try {
    const 답 = await runAI({
      prompt: buildResearchPrompt(주문),
      needsSearch: true,
      // 최근 소식만이면 주소를 열 일이 없다 — 검색만 연다.
      searchOnly: !주소읽기,
      timeoutMs: 주소읽기 ? 읽기한도ms : 소식한도ms,
      meta,
    });
    const 값 = (parseJsonLoose(답) ?? {}) as Record<string, unknown>;
    const 글 = (k: string, 최대: number) => (typeof 값[k] === "string" ? (값[k] as string).trim().slice(0, 최대) : "");
    return {
      블로그메모: 글("blog_brief", 1500), 카테고리메모: 글("brief", 2000), 최근소식: 글("news", 1500),
      실패: "", ms: Date.now() - 시작, meta,
    };
  } catch (탈) {
    const 까닭 = (탈 as Error).message || String(탈);
    console.warn(`[${주문.category.name}] 조사 건너뜀 (${Math.round((Date.now() - 시작) / 1000)}초): ${까닭}`);
    return { ...빈것, 실패: 까닭, ms: Date.now() - 시작, meta };
  }
}
