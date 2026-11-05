/**
 * "포스팅 방향 설정"의 프리셋 목록. 프리셋을 기본 골격으로 고르고, 그 아래
 * 자유 텍스트로 세부 사항을 보강하는 "프리셋 + 보강 혼합형" 입력 방식을 뒷받침한다.
 *
 * **프리셋마다 지시문이 여러 개(instructions)인 이유.**
 *
 * 전에는 프리셋 하나에 지시문 **문장 하나**뿐이었다. 그러면 그 프리셋을 쓰는
 * 동안 모든 글에 토씨 하나 안 틀리고 같은 문장이 들어간다. "전문가 분석형"처럼
 * 색이 뚜렷한 프리셋일수록, 30편쯤 쌓이면 "근거와 배경을 짚어가며 구조적으로"
 * 라는 지시가 매번 똑같은 글의 뼈대로 드러나 "AI 가 쓴 티"가 났다 — 실제로
 * 겪은 일이다. 그래서 프리셋마다 **뜻은 같지만 표현이 다른 문구를 2~3개** 두고,
 * `src/claude/포스팅방향다양화.ts` 가 변주.ts 와 같은 방식으로 최근 글과
 * 겹치지 않는 것을 고른다. `random` 은 프리셋 자체도 매 글 다르게 고르는
 * 11번째 선택지다(위 모듈이 처리 — 이 표에는 이름표만 있다).
 */
export const POSTING_DIRECTION_PRESETS: Record<
  string,
  { label: string; description: string; instructions: string[] }
> = {
  balanced: {
    label: "균형잡힘 (기본값)",
    description: "특별히 강조하는 방향 없이, 기존 스타일 규칙만 따른다.",
    instructions: [""],
  },
  friendly_review: {
    label: "친근한 후기형",
    description: "친구에게 말하듯 반말 섞인 구어체, 실제 경험담 위주.",
    instructions: [
      "친구에게 말하듯 편안한 반말 섞인 구어체를 쓰고, 정보 나열보다 실제로 겪어본 것 같은 개인 경험담과 솔직한 리액션을 중심으로 써라.",
      "반말 섞인 친근한 말투로, 정보를 늘어놓기보다 직접 써 보고 겪은 사람의 생생한 소감과 솔직한 반응 위주로 풀어 써라.",
    ],
  },
  polite_info: {
    label: "정중한 정보형",
    description: "존댓말, 팩트 위주, 과장 없는 정보 전달.",
    instructions: [
      "처음부터 끝까지 정중한 존댓말을 유지하고, 개인적인 리액션보다는 정확한 정보 전달과 근거 제시를 중심으로 차분하게 써라.",
      "시종일관 예의 바른 존댓말로, 감정 섞인 반응은 자제하고 사실과 근거를 짚어 가며 차분히 정보를 전달하라.",
    ],
  },
  emotional_essay: {
    label: "감성 에세이형",
    description: "잔잔하고 사색적인 톤, 은유와 감정 표현이 풍부.",
    instructions: [
      "잔잔하고 사색적인 에세이 톤으로, 은유와 감정 묘사를 풍부하게 써서 읽는 사람이 함께 느끼게 하라.",
      "담담하면서도 깊이 있는 에세이 어조로, 비유와 섬세한 감정 묘사를 곁들여 독자의 마음에 와닿게 써라.",
    ],
  },
  humorous_casual: {
    label: "유머러스 캐주얼형",
    description: "드립과 이모지가 많은 하이텐션 톤.",
    instructions: [
      "드립과 위트 있는 농담을 곳곳에 섞고, 이모지를 적극적으로 사용하는 유쾌하고 텐션 높은 톤으로 써라.",
      "곳곳에 재치 있는 드립을 치고 이모지를 아낌없이 쓰며, 하이텐션으로 신나게 떠들듯 써라.",
    ],
  },
  expert_analysis: {
    label: "전문가 분석형",
    description: "데이터/근거 인용, 구조적 설명, 신뢰감 있는 어조.",
    instructions: [
      "전문가가 분석하듯 근거와 배경을 짚어가며 구조적으로 설명하고, 신뢰감 있고 안정적인 어조를 유지하라.",
      "전문가의 시선으로 자료·근거를 짚어 가며 체계적으로 풀어내고, 차분하고 믿음직한 어조를 끝까지 유지하라.",
    ],
  },
  storytelling: {
    label: "스토리텔링형",
    description: "하나의 이야기를 따라가듯 기승전결로 풀어낸다.",
    instructions: [
      "하나의 이야기를 따라가듯 기승전결이 있게 풀어내라 — 상황이 시작되고, 전개되고, 고비를 지나, 결말에 이르는 흐름으로 써라.",
      "독자를 이야기 속으로 끌고 들어가듯, 사건이 펼쳐지는 순서대로 기승전결을 살려 서사적으로 써라.",
    ],
  },
  qna_style: {
    label: "질문·대화형",
    description: "독자에게 말 걸듯 묻고 답하며 대화하듯 전개.",
    instructions: [
      "독자에게 말을 거는 것처럼 질문을 던지고 그에 답하는 식으로, 대화하듯 자연스럽게 글을 전개하라.",
      "독자가 옆에 있는 것처럼 계속 질문을 건네고 답을 주고받는 대화체로 풀어 가라.",
    ],
  },
  concise_summary: {
    label: "간결 요약형",
    description: "군더더기 없이 핵심만, 목록 위주로 빠르게.",
    instructions: [
      "군더더기 설명 없이 핵심만 짧고 빠르게 전달하고, 목록과 짧은 문장을 적극 활용해 한눈에 들어오게 써라.",
      "배경 설명은 최소화하고 결론과 핵심 정보 위주로 간결하게, 목록 형태를 적극 써서 빠르게 읽히게 써라.",
    ],
  },
  scene_report: {
    label: "현장감 르포형",
    description: "마치 그 자리에 있는 것처럼 구체적인 장면·디테일 중심.",
    instructions: [
      "기자가 현장을 취재하듯, 마치 그 자리에 있는 것처럼 구체적인 장면과 디테일(소리·모습·분위기)을 담아 생생하게 써라.",
      "현장에 직접 가 본 것처럼 구체적인 장면 묘사와 디테일을 곳곳에 넣어, 읽는 사람이 그 자리에 있는 듯 느끼게 써라.",
    ],
  },
  /**
   * 고르면 **프리셋 자체를 매 글 바꾼다.** 위 10종 중 최근 글에서 덜 쓴
   *것을 `포스팅방향다양화.ts` 가 고른다 — 여기 instructions 는 안 쓰인다
   * (그 모듈이 이 id 를 따로 처리한다). 하나로 색을 굳히고 싶지 않을 때.
   */
  random: {
    label: "🎲 랜덤 (매 글 다르게)",
    description: "위 10종 중 최근 글과 겹치지 않는 것을 매번 새로 골라 쓴다.",
    instructions: [""],
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
  /** 참이면 참고 주소를 열라고 하지 않는다 — 글쓰기에는 도구가 없고, 조사 단계가 읽어 둔 메모로 대신한다. */
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
    lines.push(`이 블로그가 전체적으로 다루는 넓은 범위: ${세부.map((x) => `"${x}"`).join(", ")}. `
      + `이는 **블로그 전체의 울타리**일 뿐, 이번 글 하나의 구체적인 소재는 아니다 — `
      + `**이번 글이 실제로 무엇을 다룰지는 아래 카테고리 설명·주제 키워드가 정한다.** `
      + `그 카테고리는 이 범위 중 한 조각(소주제)을 맡고 있으니, 그 조각에 맞게 좁혀서 깊게 써라. `
      + `이 넓은 목록 전체를 한 글에 다 언급하거나, 카테고리의 구체적인 소주제를 두고 `
      + `이 목록의 다른 일반적인 이야기로 되돌아가지 마라.`
      + (세부.some((x) => x.includes(" > "))
        ? ` («A > B» 는 A 업종 안의 B 세부 업종이라는 뜻이다. 그 세부 업종의 손님·상품·현장에 맞춰 써라.)`
        : ""));
  } else if (topicLabel) {
    lines.push(`이 블로그의 주제 분야는 "${topicLabel}"이다 — 블로그 전체의 넓은 분야일 뿐이니, `
      + `이번 글의 실제 소재는 아래 카테고리 설명·주제 키워드를 따라 그 안의 구체적인 조각으로 좁혀서 써라.`);
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
      "[참고 주소 — 이 블로그의 기준 자료. 읽어 둔 내용은 아래 [조사 자료]의 블로그 메모에 있다. 직접 열지 마라]",
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
  // «우선한다» 는 말투·브랜드처럼 전역에서 정한 것을 카테고리 설명이 거스르지 말라는
  // 뜻이었는데, "이번 글의 소재까지 이 전역 범위 안에 머물러야 한다" 로 읽혀 카테고리
  // 별 소주제가 블로그 전체의 넓은 주제로 도로 흡수되는 일이 있었다(2026-11-05).
  // 말투·브랜드는 여기서 정하고, **이번 글의 구체적인 소재는 아래 카테고리가 정한다** —
  // 그 둘을 헷갈리지 않게 머리말을 바꾼다.
  return `[블로그 전역 설정 — 말투·브랜드 등 블로그 전체의 바탕이다. 이번 글의 구체적인 소재는 `
    + `이 글이 아니라 아래 카테고리 설명·주제 키워드가 정한다]\n${lines.join("\n")}\n`;
}
