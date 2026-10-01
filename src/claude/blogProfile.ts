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

// ─────────────────────────────────────────── 블로그 정보 (세부 주제·참고 주소·회사 정보)
//
// 주제 분야를 드롭다운 하나로만 고르게 했더니 «개인 블로그 / 일상·생각» 같은 넓은
// 정보밖에 AI 에게 못 줬다. 그래서 세부 주제를 여러 개 고르거나 직접 더하고,
// 이 블로그의 기준이 되는 주소(대표 블로그·참고 사이트·인스타·유튜브·홈페이지)와
// 기업이면 회사 정보를 저장해 둔다. 이 값들은 체험 키마다 따로 저장된다.

/**
 * 기업 블로그의 업종 — **대표 업종 15개 × 세부 업종 5개 안팎.**
 *
 * 처음에는 업종 15개를 한 줄로만 늘어놓았다. «외식업» 하나로는 한식당인지
 * 카페인지 몰라서 글감이 넓게 퍼졌다. 대표 업종 자체도 고를 수 있고, 세부
 * 업종을 고르면 «외식 > 카페·디저트» 처럼 대표 업종의 짧은 이름을 붙여
 * 저장한다 — AI 가 어느 업종의 카페인지까지 알게.
 */
export const BUSINESS_INDUSTRY_GROUPS: { group: string; short: string; subs: string[] }[] = [
  { group: "제조업", short: "제조", subs: ["식품 제조", "화장품·뷰티 제조", "의류·섬유", "기계·장비", "전자·부품"] },
  { group: "도소매업", short: "도소매", subs: ["온라인 쇼핑몰", "스마트스토어", "편의점·마트", "도매·유통", "수입·수출 무역"] },
  { group: "외식업", short: "외식", subs: ["한식당", "카페·디저트", "치킨·피자·패스트푸드", "주점·호프", "베이커리"] },
  { group: "서비스업", short: "서비스", subs: ["미용실·네일", "세탁·수선", "청소·방역", "웨딩·행사", "반려동물 서비스"] },
  { group: "건설업", short: "건설", subs: ["인테리어·리모델링", "종합건설", "전기·설비 공사", "조경", "집수리·시공"] },
  { group: "정보통신업 (IT 및 소프트웨어)", short: "IT", subs: ["앱·웹 개발", "SaaS·솔루션", "IT 컨설팅", "게임 개발", "데이터·AI"] },
  { group: "부동산 및 임대업", short: "부동산", subs: ["공인중개사무소", "분양·시행", "상가·오피스 임대", "주택 임대·관리", "공유오피스"] },
  { group: "숙박 및 관광업", short: "숙박·관광", subs: ["호텔·리조트", "펜션·민박", "게스트하우스", "여행사", "캠핑장·글램핑"] },
  { group: "물류 및 운수업", short: "물류", subs: ["택배·배송", "화물 운송", "이사·용달", "창고·풀필먼트", "퀵서비스"] },
  { group: "교육 및 학원업", short: "교육", subs: ["입시·보습학원", "어학원", "예체능 학원", "코딩·IT 교육", "온라인 강의"] },
  { group: "금융 및 보험업", short: "금융·보험", subs: ["보험 설계", "대출 상담", "투자·자산관리", "카드·결제 서비스", "핀테크"] },
  { group: "보건 및 의료업", short: "의료", subs: ["병원·의원", "치과", "한의원", "약국", "피부·성형"] },
  { group: "문화, 예술 및 엔터테인먼트업", short: "문화·예술", subs: ["공연·전시", "엔터·매니지먼트", "출판·웹툰", "영상·콘텐츠 제작", "스튜디오·사진관"] },
  { group: "농림어업 및 축산업", short: "농림축산", subs: ["농산물 직거래", "스마트팜", "축산·한우", "수산물", "귀농·체험농장"] },
  { group: "전문, 과학 및 기술 서비스업", short: "전문서비스", subs: ["법률(변호사·법무사)", "세무·회계", "노무·인사", "디자인·광고", "연구·컨설팅"] },
];

/** 세부 업종을 저장할 때의 이름 — «외식 > 카페·디저트». */
export function 세부업종이름(short: string, sub: string): string {
  return `${short} > ${sub}`;
}

/** 예전 판(업종 한 줄 15개)과 다른 곳에서 쓰던 이름. 지금은 화면이 BUSINESS_INDUSTRY_GROUPS 를 쓴다. */
export const BUSINESS_INDUSTRIES = BUSINESS_INDUSTRY_GROUPS.map((g) => g.group);

/** 참고 주소의 종류. 종류마다 AI 에게 시키는 일이 조금씩 다르다. */
export const LINK_KINDS: Record<string, string> = {
  main: "대표 블로그·사이트",
  ref: "참고 사이트·뉴스",
  homepage: "공식 홈페이지",
  instagram: "인스타그램",
  youtube: "유튜브",
  store: "스마트스토어·플레이스",
  etc: "기타",
};

export const 세부주제_최대 = 10;
export const 주소_최대 = 10;

export interface BlogLink { kind: string; url: string; note: string }
export interface BlogBrand { name: string; intro: string; products: string }

function 짧게(값: unknown, 길이: number): string {
  return String(값 ?? "").replace(/\s+/g, " ").trim().slice(0, 길이);
}

function 제이슨읽기(글: string | null | undefined): unknown {
  if (!글) return null;
  try { return JSON.parse(글); } catch { return null; }
}

/** 세부 주제 목록을 다듬는다 → JSON 글자. 화면이 배열이나 JSON 글자를 보낸다. */
export function 세부주제다듬기(값: unknown): string {
  const 날 = typeof 값 === "string" ? (제이슨읽기(값) ?? 값.split(",")) : 값;
  const 목록 = (Array.isArray(날) ? 날 : []).map((x) => 짧게(x, 40)).filter(Boolean);
  return JSON.stringify([...new Set(목록)].slice(0, 세부주제_최대));
}

export function 세부주제읽기(글: string | null | undefined): string[] {
  const 날 = 제이슨읽기(글);
  return Array.isArray(날) ? 날.map((x) => String(x)).filter(Boolean) : [];
}

/** 참고 주소를 다듬는다 → JSON 글자. http(s) 가 아니면 버린다. */
export function 주소목록다듬기(값: unknown): string {
  const 날 = typeof 값 === "string" ? 제이슨읽기(값) : 값;
  const 목록: BlogLink[] = [];
  for (const x of Array.isArray(날) ? 날 : []) {
    const o = (x ?? {}) as Record<string, unknown>;
    const url = 짧게(o.url, 300);
    if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(url)) continue;
    const kind = typeof o.kind === "string" && o.kind in LINK_KINDS ? o.kind : "etc";
    if (목록.some((l) => l.url === url)) continue;
    목록.push({ kind, url, note: 짧게(o.note, 60) });
  }
  return JSON.stringify(목록.slice(0, 주소_최대));
}

export function 주소목록읽기(글: string | null | undefined): BlogLink[] {
  const 날 = 제이슨읽기(글);
  return Array.isArray(날) ? (날 as BlogLink[]) : [];
}

/** 회사·브랜드 정보를 다듬는다 → JSON 글자. */
export function 브랜드다듬기(값: unknown): string {
  const 날 = (typeof 값 === "string" ? 제이슨읽기(값) : 값) as Record<string, unknown> | null;
  return JSON.stringify({
    name: 짧게(날?.name, 40), intro: 짧게(날?.intro, 120), products: 짧게(날?.products, 200),
  });
}

export function 브랜드읽기(글: string | null | undefined): BlogBrand {
  const 날 = (제이슨읽기(글) ?? {}) as Record<string, unknown>;
  return { name: 짧게(날.name, 40), intro: 짧게(날.intro, 120), products: 짧게(날.products, 200) };
}

export interface BlogProfileSettings {
  blogType: string | null;
  blogTopic: string | null;
  /** 세부 주제 (칩으로 고르거나 직접 더한 것). 있으면 blogTopic 보다 먼저 쓴다. */
  blogTopics?: string[];
  links?: BlogLink[];
  brand?: BlogBrand | null;
  /** 프리셋이 내장이든 사용자 커스텀이든, 호출부에서 미리 찾아온 실제 지시문 텍스트를 받는다
   * (프리셋 저장 위치가 바뀌어도 이 함수는 몰라도 되게 하기 위함 — settings.ts의
   * resolvePostingDirectionInstruction() 참고). */
  postingDirectionInstruction: string | null;
  postingDirectionRefinement: string | null;
  /** 참이면 참고 주소를 열라고 하지 않는다 — 이미 읽어 둔 자료 메모로 대신한다. */
  주소는메모로?: boolean;
}

/** 카테고리별 prompt_hint보다 앞서 프롬프트 맨 위에 주입되는 전역 컨텍스트 블록. */
export function buildBlogProfileBlock(settings: BlogProfileSettings): string {
  const lines: string[] = [];

  const typeLabel =
    settings.blogType === "business" ? "기업 블로그" : settings.blogType === "personal" ? "개인 블로그" : null;
  if (typeLabel) lines.push(`이 블로그는 ${typeLabel}이다.`);

  const 세부 = (settings.blogTopics ?? []).filter(Boolean);
  const topicLabel = settings.blogTopic ? findBlogTopicLabel(settings.blogTopic) : null;
  if (세부.length) {
    lines.push(`이 블로그가 꾸준히 다루는 세부 주제: ${세부.map((x) => `"${x}"`).join(", ")}. `
      + `글감·예시·용어는 이 주제들 안에서 고르고, 벗어난 소재로 빠지지 마라.`
      + (세부.some((x) => x.includes(" > "))
        ? ` («A > B» 는 A 업종 안의 B 세부 업종이라는 뜻이다. 그 세부 업종의 손님·상품·현장에 맞춰 써라.)`
        : ""));
  } else if (topicLabel) {
    lines.push(`이 블로그의 주제 분야는 "${topicLabel}"이다. 이 분야와 맞닿는 소재를 우선 고려하라.`);
  }

  const 회사 = settings.brand;
  if (settings.blogType === "business" && 회사 && (회사.name || 회사.intro || 회사.products)) {
    const 줄 = [`이 블로그를 운영하는 회사·브랜드: ${회사.name || "(이름 없음)"}`];
    if (회사.intro) 줄.push(`한 줄 소개: ${회사.intro}`);
    if (회사.products) 줄.push(`주요 상품·서비스: ${회사.products}`);
    줄.push("이 브랜드의 블로그 글로 쓰되, 광고 문구처럼 과장하지 말고 독자에게 실제로 도움이 되는 정보를 중심에 둬라. "
      + "상품·가격·혜택은 아래 참고 주소나 위 정보에 있는 것만 말하고, 없는 약속(무조건·100%·최저가 보장)을 만들지 마라.");
    lines.push(줄.join("\n"));
  }

  const 주소 = (settings.links ?? []).filter((l) => l && l.url);
  if (주소.length && settings.주소는메모로) {
    lines.push([
      "[참고 주소 — 이 블로그의 기준 자료. 이미 읽고 정리한 내용이 아래 «자료 메모» 에 있다. 다시 열지 마라]",
      ...주소.map((l) => `- (${LINK_KINDS[l.kind] ?? "기타"}) ${l.url}${l.note ? ` — ${l.note}` : ""}`),
    ].join("\n"));
  } else if (주소.length) {
    lines.push([
      "[참고 주소 — 이 블로그의 기준 자료. 글을 쓰기 전에 먼저 열어 보라]",
      ...주소.map((l) => `- (${LINK_KINDS[l.kind] ?? "기타"}) ${l.url}${l.note ? ` — ${l.note}` : ""}`),
      "이 주소들에서 이 블로그가 실제로 다루는 소재·용어·말투·상품 정보를 파악하고, 이번 카테고리 주제와 맞닿는 "
      + "최신 소식·자료를 찾아 글의 바탕으로 삼아라. 대표 블로그는 말투와 다루는 범위를, 참고 사이트·뉴스는 "
      + "사실과 최신 소식을, 홈페이지·스토어는 상품·서비스 정보를 보는 곳이다.",
      "지킬 것: 문장을 그대로 베끼지 말고 네 말로 다시 써라. 숫자·날짜·가격은 출처 그대로 옮겨라. "
      + "로그인해야 보이는 곳(인스타그램·유튜브의 게시물 목록 등)은 억지로 열지 말고, 공개된 소개·계정 이름·"
      + "검색에 잡히는 공개 정보만 참고하라. 열리지 않는 주소가 있으면 건너뛰고 나머지로 써라.",
    ].join("\n"));
  }

  if (settings.postingDirectionInstruction?.trim()) {
    lines.push(settings.postingDirectionInstruction.trim());
  }

  if (settings.postingDirectionRefinement?.trim()) {
    lines.push(`추가로 다음 사항도 반드시 반영하라: ${settings.postingDirectionRefinement.trim()}`);
  }

  if (lines.length === 0) return "";
  return `[블로그 전역 설정 — 아래 카테고리 설명보다 우선한다]\n${lines.join("\n")}\n`;
}
