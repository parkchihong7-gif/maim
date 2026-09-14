import { z } from "zod";

export const PostResponseSchema = z.object({
  title: z.string().min(3).max(200),
  content: z.string().min(500),
  image_query: z.string().min(2).max(80),
  tags: z.array(z.string().regex(/^#/)).min(5).max(15),
});

export type PostResponse = z.infer<typeof PostResponseSchema>;

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
    throw new Error("No JSON object braces found in response");
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

export function parsePostResponse(rawResult: string): { post: PostResponse; warnings: string[] } {
  const parsedRaw = parseJsonLoose(rawResult);
  const post = PostResponseSchema.parse(parsedRaw);
  const { sanitized, warnings } = sanitizeContent(post.content);
  return { post: { ...post, content: sanitized }, warnings };
}

export function parseImageSelectResponse(rawResult: string): z.infer<typeof ImageSelectSchema> {
  const parsedRaw = parseJsonLoose(rawResult);
  return ImageSelectSchema.parse(parsedRaw);
}
