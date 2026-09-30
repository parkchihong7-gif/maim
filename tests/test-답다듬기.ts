/**
 * **AI 답의 자잘한 모양 차이로 글 전체를 버리지 않는지** 시험한다.
 *
 *     npx tsx tests/test-답다듬기.ts
 */
import { parsePostResponse } from "../src/claude/parseResponse.js";

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

console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
