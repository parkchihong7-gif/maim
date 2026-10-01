/**
 * **카테고리·블로그 정보를 세분화한 것이 실제로 AI 지시문까지 가는지** 시험한다.
 *
 *     npx tsx tests/test-카테고리세분화.ts
 *
 * 겪은 일 — 주제 키워드가 고유명사이거나 뜻이 여럿이면 엉뚱한 글이 나왔고,
 * 키워드는 한 번 쓰고 나면 사라져 두 번째 글부터 주제가 흐려졌다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-cat-"));
const 기록 = path.join(임시, "prompt.txt");
const 가짜 = path.join(임시, "fake-claude.mjs");
fs.writeFileSync(가짜, `#!/usr/bin/env node
import fs from "node:fs";
const a = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(기록)}, a.join("\\u0001"));
const 글 = { keyword: "초등 스크래치 게임 만들기", title: "초등 스크래치 게임 만들기 주말 1시간이면 첫 작품 완성하는 법",
  content: "초등 스크래치 게임 만들기. ".repeat(80), image_query: "kids coding",
  tags: ["#초등스크래치","#코딩","#게임"], title_variants: [] };
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
`);
fs.chmodSync(가짜, 0o755);
process.env.DATA_DIR = 임시;
process.env.CLAUDE_BIN = 가짜;
delete process.env.AI_ENGINE;

const { getDb } = await import("../src/db/index.js");
const { 자리에서, 주인 } = await import("../src/tenancy.js");
const C = await import("../src/db/repositories/categories.js");
const S = await import("../src/db/repositories/settings.js");
const B = await import("../src/claude/blogProfile.js");
const { buildPostPrompt } = await import("../src/claude/promptBuilder.js");
const { generatePost } = await import("../src/pipeline/generatePost.js");
const { assignDirectives } = await import("../src/pipeline/directives.js");
getDb();

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① 카테고리에 뜻을 좁히는 말·빼야 할 말·참고 주소·계속 유지가 저장된다");
const 카 = 자리에서(주인, () => C.createCategory({
  name: "초등 코딩 교육", requiresSearch: true, promptHint: "초등 학부모에게 코딩 수업 후기를 솔직하게",
  topicKeyword: "스크래치", mustKeywords: "코딩,  초등, 코딩", excludeKeywords: "자동차 흠집, 복권",
  referenceUrls: "https://www.moe.go.kr\nftp://bad\nhttps://www.moe.go.kr\nnot-a-url", keywordKeep: true,
}));
참("함께 들어갈 말은 겹친 것 빼고", 카.must_keywords === "코딩, 초등");
참("빼야 할 말", 카.exclude_keywords === "자동차 흠집, 복권");
참("주소는 http(s) 만, 겹친 것 빼고", 카.reference_urls === "https://www.moe.go.kr");
참("계속 유지 켜짐", 카.keyword_keep === 1);

console.log("\n② 지시문 — 키워드를 카테고리 맥락으로 좁히고, 다른 뜻을 버리게 한다");
const 지시 = buildPostPrompt(카, assignDirectives(1)[0], "2026-10-01", [], "");
참("카테고리 맥락으로 해석하라", 지시.includes("「초등 코딩 교육」") && 지시.includes("맥락에서 해석"));
참("검색어는 키워드 + 함께 들어갈 말", 지시.includes("«스크래치 + 위 말 중 하나»") && 지시.includes("코딩, 초등"));
참("빼야 할 말이 든 결과는 버려라", 지시.includes("자동차 흠집, 복권") && 지시.includes("버려라"));
참("소식이 없어도 다른 주제로 빠지지 마라", 지시.includes("키워드와 무관한 소재로 바꾸는 것은 실패"));
참("카테고리 참고 주소를 먼저 열어 보라", 지시.includes("https://www.moe.go.kr") && 지시.includes("먼저 열어 보라"));

console.log("\n②-1 대표 주소 + 참고 주소 (+/× 로 더하고 지우는 줄)");
const 카2 = 자리에서(주인, () => C.createCategory({
  name: "통계 해설", requiresSearch: false, promptHint: "통계 숫자를 쉽게",
  mainUrl: "https://kosis.kr\nhttps://second.example.com", referenceUrls: "https://kosis.kr\nhttps://www.korea.kr",
}));
참("대표 주소는 하나만", 카2.main_url === "https://kosis.kr");
const 지시2 = buildPostPrompt(카2, assignDirectives(1)[0], "2026-10-01", [], "");
참("대표 주소를 가장 먼저 열라고 한다", 지시2.includes("대표 주소(기준 출처, 가장 먼저): https://kosis.kr"));
참("참고 주소도 같이 간다", 지시2.includes("참고 주소: https://kosis.kr · https://www.korea.kr"));
자리에서(주인, () => C.updateCategory(카2.id, { mainUrl: null }));
참("대표 주소를 지울 수 있다", 자리에서(주인, () => C.getCategory(카2.id))?.main_url === null);

console.log("\n③ 블로그 정보 — 세부 주제·회사 정보·참고 주소가 지시문 맨 위로 간다");
const 정보 = B.buildBlogProfileBlock({
  blogType: "business", blogTopic: null,
  blogTopics: JSON.parse(B.세부주제다듬기(["학원·교육", "초등 코딩", "학원·교육", ""])),
  links: JSON.parse(B.주소목록다듬기([
    { kind: "homepage", url: "https://our-academy.kr", note: "수업 안내" },
    { kind: "instagram", url: "https://www.instagram.com/our_academy" },
    { kind: "nope", url: "javascript:alert(1)" },
  ])),
  brand: B.브랜드읽기(B.브랜드다듬기({ name: "노원 코딩학원", intro: "초등 전문", products: "스크래치반, 파이썬반" })),
  postingDirectionInstruction: null, postingDirectionRefinement: null,
});
참("세부 주제 (겹친 것·빈 것 빼고)", 정보.includes('"학원·교육", "초등 코딩"'));
참("회사 이름·상품", 정보.includes("노원 코딩학원") && 정보.includes("스크래치반, 파이썬반"));
참("없는 약속 금지", 정보.includes("무조건·100%·최저가 보장"));
참("홈페이지·인스타 주소", 정보.includes("(공식 홈페이지) https://our-academy.kr — 수업 안내") && 정보.includes("(인스타그램)"));
참("javascript: 같은 주소는 버린다", !정보.includes("javascript"));
참("베끼지 말고, 로그인 필요한 곳은 공개 정보만", 정보.includes("베끼지 말고") && 정보.includes("공개된 소개"));

console.log("\n③-1 기업 업종 — 대표 업종 15개 × 세부 업종 5개 안팎");
참("대표 업종 15개", B.BUSINESS_INDUSTRY_GROUPS.length === 15);
참("세부 업종은 4~6개씩", B.BUSINESS_INDUSTRY_GROUPS.every((g) => g.subs.length >= 4 && g.subs.length <= 6));
const 카페 = B.세부업종이름("외식", "카페·디저트");
참("세부 업종은 «외식 > 카페·디저트» 로 저장", 카페 === "외식 > 카페·디저트");
const 업종글 = B.buildBlogProfileBlock({ blogType: "business", blogTopic: null,
  blogTopics: JSON.parse(B.세부주제다듬기([카페, "외식업", B.세부업종이름("전문서비스", "법률(변호사·법무사)")])),
  postingDirectionInstruction: null, postingDirectionRefinement: null });
참("긴 업종 이름도 잘리지 않는다", 업종글.includes("전문서비스 > 법률(변호사·법무사)"));
참("«A > B» 뜻을 AI 에게 알려 준다", 업종글.includes("A 업종 안의 B 세부 업종"));

console.log("\n④ 실제 글쓰기 — 체험 자리의 블로그 정보가 그 사람 글에만 들어가고, 주소가 있으면 열람 도구를 켠다");
const 체험 = { ownerKey: "KEY-A", role: "client" };
자리에서(체험, () => {
  S.개인설정정하기("blog_type", "personal");
  S.개인설정정하기("blog_topics", B.세부주제다듬기(["노원구 재건축"]));
  S.개인설정정하기("blog_links", B.주소목록다듬기([{ kind: "main", url: "https://blog.naver.com/a-blog" }]));
  S.최소분량정하기(800);
});
const 카A = 자리에서(체험, () => C.createCategory({ name: "동네 소식", requiresSearch: false, promptHint: "노원구 이야기" }));
await 자리에서(체험, () => generatePost(카A, assignDirectives(1)[0]));
const 인자 = fs.readFileSync(기록, "utf8").split("\u0001");
const 지시A = 인자[인자.indexOf("-p") + 1];
참("체험 A 의 세부 주제가 들어갔다", 지시A.includes("노원구 재건축"));
참("체험 A 의 대표 블로그 주소가 들어갔다", 지시A.includes("https://blog.naver.com/a-blog"));
참("주소가 있으니 검색이 꺼진 카테고리여도 WebSearch·WebFetch 를 연다",
  인자.includes("WebSearch") && 인자.includes("WebFetch"));
const 주인블로그 = 자리에서(주인, () => S.개인설정("blog_topics"));
참("주인 설정에는 체험 A 의 주제가 없다", !(주인블로그 ?? "").includes("노원구 재건축"));

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
