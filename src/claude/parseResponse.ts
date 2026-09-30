import { z } from "zod";

/**
 * AI 답의 **자잘한 모양 차이**를 규격에 맞게 다듬는다.
 *
 * 본문이 멀쩡한데 태그에 «#» 하나가 빠졌다고 글 전체를 버리면, 쓰시는 분은
 * 영문 모를 오류만 보고 그날 한도 하나를 잃는다. 모델마다 버릇이 다르다 —
 * 특히 가벼운 모델(Gemini flash 등)이 이런 데서 자주 어긋난다.
 *
 *   * 태그: «#» 이 없으면 붙이고, 글자 하나로 오면 나눈다. 겹치면 하나로, 15개까지
 *   * 이미지 검색어: 너무 길면 80자에서 자른다
 *   * 제목 후보: `{"title": "…"}` 처럼 모양이 달라도 제목만 꺼낸다. 못 쓰는 것은
 *     버린다 — 후보는 덤이라 없어도 글은 나간다
 *
 * **본문과 제목은 다듬지 않는다.** 그게 틀렸으면 정말로 다시 써야 한다.
 */
function 다듬기(날것: unknown): unknown {
  if (!날것 || typeof 날것 !== "object" || Array.isArray(날것)) return 날것;
  const 글 = { ...(날것 as Record<string, unknown>) };

  let 태그 = 글.tags;
  if (typeof 태그 === "string") 태그 = 태그.split(/[\s,]+/);
  if (Array.isArray(태그)) {
    const 본것 = new Set<string>();
    글.tags = 태그
      .map((x) => String(x ?? "").trim())
      .filter((x) => x && x !== "#")
      .map((x) => (x.startsWith("#") ? x : `#${x}`))
      .filter((x) => (본것.has(x) ? false : (본것.add(x), true)))
      .slice(0, 15);
  }

  if (typeof 글.image_query === "string") {
    글.image_query = 글.image_query.trim().slice(0, 80);
  }

  const 후보 = 글.title_variants;
  if (후보 !== undefined) {
    글.title_variants = (Array.isArray(후보) ? 후보 : [])
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object") {
          const o = x as Record<string, unknown>;
          return String(o.title ?? o.text ?? o.제목 ?? "");
        }
        return "";
      })
      .map((x) => x.trim())
      .filter((x) => x.length >= 3 && x.length <= 200);
  }
  return 글;
}

export const PostResponseSchema = z.preprocess(다듬기, z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(500),
  image_query: z.string().min(2).max(80),
  // 다섯 개를 달라고 시키지만, 셋만 와도 글은 쓸 만하다. 그걸로 글 전체를
  // 버리지 않는다.
  tags: z.array(z.string().regex(/^#/)).min(3).max(15),
  // 후킹 패턴이 다른 제목 후보 3개(질문형/숫자·사실 강조형/공감형). 모델이
  // 빠뜨려도 전체 파싱이 깨지지 않도록 선택 필드로 방어적으로 받는다.
  title_variants: z.array(z.string().min(3).max(200)).optional().default([]),
}));

export type PostResponse = z.infer<typeof PostResponseSchema>;

/** "예시 포스팅" 미리보기 전용 — 짧은 샘플이라 image_query/tags 없이 title/content만 받는다. */
export const PreviewResponseSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(100),
});

export const ImageSelectSchema = z.object({
  selected_indices: z.array(z.number().int().min(0)).min(1),
  // selected_indices와 같은 순서/개수여야 하지만, 모델이 빠뜨릴 수도 있으니
  // optional로 받고 selectImage.ts에서 부족한 만큼 대체 문구로 채운다.
  alt_texts: z.array(z.string()).optional().default([]),
  reason: z.string(),
});

const BANNED_PATTERNS: { regex: RegExp; label: string }[] = [
  { regex: /^#{1,6}\s.*$/gm, label: "#" },
  { regex: /^\*\s.*$/gm, label: "* " },
  { regex: /■/g, label: "■" },
  { regex: /▶/g, label: "▶" },
];

function extractJsonCandidate(raw: string): string {
  let text = raw.trim();
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }
  return text;
}

function repairJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    // AI 가 글 대신 **다른 말**을 돌려준 것이다. 그 말이 곧 까닭인 때가 많다
    // («로그인이 필요합니다», «한도를 넘었습니다» 따위). 앞부분을 보여 준다.
    const 앞 = text.replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(`AI 가 글 대신 다른 말을 돌려주었습니다 — «${앞 || "(빈 답)"}». `
      + "한 번 더 해 보시고, 되풀이되면 서버 주인이 [관리자 설정] 1단계의 [연결 테스트] 로 AI 연결을 확인해 주세요.");
  }
  return text.slice(start, end + 1);
}

export function parseJsonLoose(rawResult: string): unknown {
  const candidate = extractJsonCandidate(rawResult);
  try {
    return JSON.parse(candidate);
  } catch {
    const repaired = repairJson(candidate);
    return JSON.parse(repaired);
  }
}

/** 스타일 규칙(마크다운 기호 금지) 위반을 코드로 재검사·제거한다. 프롬프트 드리프트 감지용. */
export function sanitizeContent(content: string): { sanitized: string; warnings: string[] } {
  let sanitized = content;
  const warnings: string[] = [];
  for (const { regex, label } of BANNED_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(sanitized)) {
      warnings.push(`금지된 서식 문자 발견: ${label}`);
      regex.lastIndex = 0;
      sanitized = sanitized.replace(regex, "");
    }
  }
  return { sanitized, warnings };
}

/**
 * Zod 가 내는 영문 덩어리를 **읽을 수 있는 한 줄**로 바꾼다.
 *
 * 그대로 두면 화면에 이런 것이 뜬다.
 *
 *   [{"code":"too_small","minimum":500,"type":"string", … "path":["content"]}]
 *
 * 쓰시는 분은 여기서 무엇을 해야 할지 알 수가 없다. 무엇이 모자란지,
 * 그래서 어떻게 하면 되는지를 말해 준다.
 */
const 칸이름: Record<string, string> = {
  title: "제목", content: "본문", image_query: "이미지 검색어",
  tags: "태그", title_variants: "제목 후보",
};

/** 받침이 있으면 «이», 없으면 «가». 「본문이(가)」 같은 글은 읽기 나쁘다. */
function 이가(말: string): string {
  const 끝 = 말.charCodeAt(말.length - 1);
  if (끝 < 0xac00 || 끝 > 0xd7a3) return "가";      // 한글이 아니면 그냥
  return (끝 - 0xac00) % 28 === 0 ? "가" : "이";
}

export function 읽기쉽게(탈: unknown): string {
  if (!(탈 instanceof z.ZodError)) return (탈 as Error)?.message ?? String(탈);
  const 줄들 = 탈.issues.map((것) => {
    const 이름 = 칸이름[String(것.path[0])] ?? String(것.path[0] || "답");
    if (것.code === "too_small") {
      const 최소 = (것 as unknown as { minimum: number }).minimum;
      const 단위 = 것.type === "array" ? "개" : "자";
      return `${이름}${이가(이름)} 모자랍니다 (${최소}${단위} 이상 필요)`;
    }
    if (것.code === "too_big") {
      const 최대 = (것 as unknown as { maximum: number }).maximum;
      return `${이름}${이가(이름)} 너무 깁니다`;
    }
    if (것.code === "invalid_type") {
      const 받은것 = (것 as unknown as { received?: string }).received;
      return 받은것 === "undefined"
        ? `${이름}${이가(이름)} 아예 없습니다`
        : `${이름}의 모양이 다릅니다`;
    }
    return `${이름}: ${것.message}`;
  });
  return `AI 가 돌려준 글이 규격에 안 맞습니다 — ${[...new Set(줄들)].join(" · ")}. `
       + `한 번 더 [지금 생성] 을 눌러 보십시오. 같은 일이 되풀이되면 `
       + `고르신 모델이 지시를 덜 따르는 것일 수 있습니다 — 서버 주인이 `
       + `[관리자 설정] 1단계에서 다른 모델을 적어 보면 됩니다.`;
}

export function parsePostResponse(rawResult: string): { post: PostResponse; warnings: string[] } {
  const parsedRaw = parseJsonLoose(rawResult);
  let post: PostResponse;
  try {
    post = PostResponseSchema.parse(parsedRaw);
  } catch (탈) {
    throw new Error(읽기쉽게(탈));
  }
  const { sanitized, warnings } = sanitizeContent(post.content);
  return { post: { ...post, content: sanitized }, warnings };
}

export function parsePreviewResponse(rawResult: string): { title: string; content: string } {
  const parsedRaw = parseJsonLoose(rawResult);
  const post = PreviewResponseSchema.parse(parsedRaw);
  const { sanitized } = sanitizeContent(post.content);
  return { title: post.title, content: sanitized };
}

export function parseImageSelectResponse(rawResult: string): z.infer<typeof ImageSelectSchema> {
  const parsedRaw = parseJsonLoose(rawResult);
  return ImageSelectSchema.parse(parsedRaw);
}
