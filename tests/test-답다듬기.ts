/**
 * **AI 답의 자잘한 모양 차이로 글 전체를 버리지 않는지** 시험한다.
 *
 *     npx tsx tests/test-답다듬기.ts
 */
import { parsePostResponse } from "../src/claude/parseResponse.js";
import { buildSeoRuleBlock } from "../src/claude/검색노출규칙.js";
import { assignDirectives } from "../src/pipeline/directives.js";

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}
const 본문 = "노원구 소형 아파트 대출 조건을 정리합니다. ".repeat(40);

console.log("\n① 태그에 # 이 빠졌거나, 검색어가 길거나, 후보 모양이 달라도 글은 나온다");
const 엉성 = JSON.stringify({
  title: "노원구 소형 아파트 대출 조건", content: 본문,
  image_query: "가".repeat(120),
  tags: ["노원구아파트", "#대출조건", "대출조건", "소형아파트"],
  title_variants: [{ type: "조건·기준형", title: "노원구 아파트 대출 한도 기준" }, "노원구 아파트 대출 신청 방법", 3, ""],
});
const 가 = parsePostResponse(엉성).post;
참("태그마다 # 이 붙었다", 가.tags.every((x) => x.startsWith("#")));
참("겹친 태그는 하나로", 가.tags.length === 3);
참("검색어는 80자에서 자른다", 가.image_query.length === 80);
참("제목 후보는 제목만 꺼내고 못 쓰는 것은 버린다",
  JSON.stringify(가.title_variants) === JSON.stringify(["노원구 아파트 대출 한도 기준", "노원구 아파트 대출 신청 방법"]));

console.log("\n② 태그가 한 줄 글자로 와도 나눈다");
const 나 = parsePostResponse(JSON.stringify({
  title: "노원구 소형 아파트 대출 조건", content: 본문, image_query: "apartment",
  tags: "#노원구 #대출, 소형아파트", title_variants: [],
})).post;
참("세 개로 나뉘었다", 나.tags.length === 3);

console.log("\n③ 본문이 모자라면 여전히 막는다");
let 막혔나 = "";
try {
  parsePostResponse(JSON.stringify({ title: "노원구 소형 아파트 대출 조건", content: "짧음",
    image_query: "apartment", tags: ["#가", "#나", "#다"] }));
} catch (탈) { 막혔나 = (탈 as Error).message; }
참("본문이 모자랍니다", 막혔나.includes("본문이 모자랍니다"));

console.log("\n④ 글 대신 다른 말이 오면 그 말을 보여 준다");
let 말 = "";
try { parsePostResponse("Please log in again to continue."); } catch (탈) { 말 = (탈 as Error).message; }
참("AI 가 한 말이 오류에 보인다", 말.includes("Please log in again"));

console.log("\n⑤ 문장처럼 긴 태그(검색 안 하는 말)는 걸러 낸다");
const 긴것 = "이것만알면업무효율이확올라가는근태관리꿀팁총정리"; // 24자
const 다 = parsePostResponse(JSON.stringify({
  title: "노원구 소형 아파트 대출 조건", content: 본문, image_query: "apartment",
  tags: ["#근태관리", "#" + 긴것, "#출근부양식", "#근태관리엑셀양식"], title_variants: [],
})).post;
참("20자 넘는 태그는 빠진다", !다.tags.some((x) => x.includes(긴것)));
참("짧은 태그 셋은 남는다", 다.tags.length === 3);

console.log("\n⑥ 다 걸러져 3개 밑으로 떨어지면(스키마 최소) 나쁜 태그라도 그대로 둔다");
const 라 = parsePostResponse(JSON.stringify({
  title: "노원구 소형 아파트 대출 조건", content: 본문, image_query: "apartment",
  tags: ["#" + 긴것, "#노원구소형아파트대출조건총정리이것만알면끝", "#가"], title_variants: [],
})).post;
참("3개 모두 그대로(글 전체를 버리지 않는다)", 라.tags.length === 3);

console.log("\n⑦ 검색 노출 규칙 — 태그는 «짧은 합성어» 로, 길이·보기를 준다");
const 노출규칙 = buildSeoRuleBlock(assignDirectives(1)[0]);
참("첫 태그는 keyword 그대로 붙여 쓰라고", 노출규칙.includes("keyword(앞머리 세부 키워드 조합)를 띄어쓰기 없이"));
참("4~14자 안에 끝내라고", 노출규칙.includes("4~14자"));
참("문장형 태그는 안 된다고(나쁜 예)", 노출규칙.includes("나쁜 예") && 노출규칙.includes("문장이라 아무도 안 친다"));
참("실제 검색어 꼴의 좋은 예가 들어 있다", 노출규칙.includes("#출근부양식") && 노출규칙.includes("#근태관리엑셀양식"));
참("신뢰 신호(E-E-A-T) — 예외·기준 시점·근거 표시를 지시한다", 노출규칙.includes("신뢰할 만한 글이라는 티") && 노출규칙.includes("기준 시점"));

console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
