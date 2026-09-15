/** "포스팅 방향 설정"의 프리셋 목록. 프리셋을 기본 골격으로 고르고, 그 아래
 * 자유 텍스트로 세부 사항을 보강하는 "프리셋 + 보강 혼합형" 입력 방식을 뒷받침한다. */
export const POSTING_DIRECTION_PRESETS: Record<
  string,
  { label: string; description: string; instruction: string }
> = {
  balanced: {
    label: "균형잡힘 (기본값)",
    description: "특별히 강조하는 방향 없이, 기존 스타일 규칙만 따른다.",
    instruction: "",
  },
  friendly_review: {
    label: "친근한 후기형",
    description: "친구에게 말하듯 반말 섞인 구어체, 실제 경험담 위주.",
    instruction:
      "친구에게 말하듯 편안한 반말 섞인 구어체를 쓰고, 정보 나열보다 실제로 겪어본 것 같은 개인 경험담과 솔직한 리액션을 중심으로 써라.",
  },
  polite_info: {
    label: "정중한 정보형",
    description: "존댓말, 팩트 위주, 과장 없는 정보 전달.",
    instruction:
      "처음부터 끝까지 정중한 존댓말을 유지하고, 개인적인 리액션보다는 정확한 정보 전달과 근거 제시를 중심으로 차분하게 써라.",
  },
  emotional_essay: {
    label: "감성 에세이형",
    description: "잔잔하고 사색적인 톤, 은유와 감정 표현이 풍부.",
    instruction:
      "잔잔하고 사색적인 에세이 톤으로, 은유와 감정 묘사를 풍부하게 써서 읽는 사람이 함께 느끼게 하라.",
  },
  humorous_casual: {
    label: "유머러스 캐주얼형",
    description: "드립과 이모지가 많은 하이텐션 톤.",
    instruction:
      "드립과 위트 있는 농담을 곳곳에 섞고, 이모지를 적극적으로 사용하는 유쾌하고 텐션 높은 톤으로 써라.",
  },
  expert_analysis: {
    label: "전문가 분석형",
    description: "데이터/근거 인용, 구조적 설명, 신뢰감 있는 어조.",
    instruction:
      "전문가가 분석하듯 근거와 배경을 짚어가며 구조적으로 설명하고, 신뢰감 있고 안정적인 어조를 유지하라.",
  },
};

/** "블로그 주제 설정"의 2단계 택소노미. 프론트엔드(index.html)에도 같은 값을 직접 나열해 둔다. */
export const BLOG_TOPIC_GROUPS: { group: string; topics: { value: string; label: string }[] }[] = [
  {
    group: "엔터테인먼트·예술",
    topics: [
      { value: "literature_books", label: "문학·책" },
      { value: "movie", label: "영화" },
      { value: "art_design", label: "미술·디자인" },
      { value: "performance_exhibit", label: "공연·전시" },
      { value: "music", label: "음악" },
      { value: "drama", label: "드라마" },
      { value: "celebrity", label: "스타·연예인" },
      { value: "comics_anime", label: "만화·애니" },
      { value: "broadcast", label: "방송" },
    ],
  },
  {
    group: "생활·노하우·쇼핑",
    topics: [
      { value: "daily_thoughts", label: "일상·생각" },
      { value: "parenting_marriage", label: "육아·결혼" },
      { value: "pets", label: "반려동물" },
      { value: "good_words_images", label: "좋은글·이미지" },
      { value: "fashion_beauty", label: "패션·미용" },
      { value: "interior_diy", label: "인테리어·DIY" },
      { value: "cooking_recipe", label: "요리·레시피" },
      { value: "product_review", label: "상품리뷰" },
      { value: "gardening", label: "원예·재배" },
    ],
  },
  {
    group: "취미·여가·여행",
    topics: [
      { value: "game", label: "게임" },
      { value: "sports", label: "스포츠" },
      { value: "photo", label: "사진" },
      { value: "car", label: "자동차" },
      { value: "hobby", label: "취미" },
      { value: "domestic_travel", label: "국내여행" },
      { value: "world_travel", label: "세계여행" },
      { value: "restaurant", label: "맛집" },
    ],
  },
  {
    group: "지식·동향",
    topics: [
      { value: "it_computer", label: "IT·컴퓨터" },
      { value: "society_politics", label: "사회·정치" },
      { value: "health_medicine", label: "건강·의학" },
      { value: "business_economy", label: "비즈니스·경제" },
      { value: "language", label: "어학·외국어" },
      { value: "education", label: "교육·학문" },
    ],
  },
];

export const BLOG_TOPIC_ALL = "all";

export function findBlogTopicLabel(value: string): string | null {
  if (!value || value === BLOG_TOPIC_ALL) return null;
  for (const g of BLOG_TOPIC_GROUPS) {
    const t = g.topics.find((t) => t.value === value);
    if (t) return t.label;
  }
  return null;
}

export interface BlogProfileSettings {
  blogType: string | null;
  blogTopic: string | null;
  postingDirectionPreset: string | null;
  postingDirectionRefinement: string | null;
}

/** 카테고리별 prompt_hint보다 앞서 프롬프트 맨 위에 주입되는 전역 컨텍스트 블록. */
export function buildBlogProfileBlock(settings: BlogProfileSettings): string {
  const lines: string[] = [];

  const typeLabel =
    settings.blogType === "business" ? "기업 블로그" : settings.blogType === "personal" ? "개인 블로그" : null;
  if (typeLabel) lines.push(`이 블로그는 ${typeLabel}이다.`);

  const topicLabel = settings.blogTopic ? findBlogTopicLabel(settings.blogTopic) : null;
  if (topicLabel) {
    lines.push(`이 블로그의 주제 분야는 "${topicLabel}"이다. 이 분야와 맞닿는 소재를 우선 고려하라.`);
  }

  const preset = settings.postingDirectionPreset
    ? POSTING_DIRECTION_PRESETS[settings.postingDirectionPreset]
    : null;
  if (preset?.instruction) lines.push(preset.instruction);

  if (settings.postingDirectionRefinement?.trim()) {
    lines.push(`추가로 다음 사항도 반드시 반영하라: ${settings.postingDirectionRefinement.trim()}`);
  }

  if (lines.length === 0) return "";
  return `[블로그 전역 설정 — 아래 카테고리 설명보다 우선한다]\n${lines.join("\n")}\n`;
}
