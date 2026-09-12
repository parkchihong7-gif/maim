/**
 * Phase 2 검증 스크립트: 카테고리 1개에 대해 실제로 claude -p를 호출해
 * draft 포스팅 1건을 생성하고 출력한다. 스타일 규칙 준수 여부를 육안으로 확인한다.
 *
 * 사용법: npx tsx tests/test-generate-post.ts [카테고리이름]
 */
import { listActiveCategories } from "../src/db/repositories/categories.js";
import { assignDirectives } from "../src/pipeline/directives.js";
import { generatePost } from "../src/pipeline/generatePost.js";

async function main() {
  const wantedName = process.argv[2];
  const categories = listActiveCategories();
  const category = wantedName
    ? categories.find((c) => c.name === wantedName)
    : categories[0];

  if (!category) {
    console.error("사용 가능한 카테고리가 없습니다. categories 이름:", categories.map((c) => c.name));
    process.exit(1);
  }

  console.log(`카테고리: ${category.name} (requires_search=${category.requires_search})`);
  const [directive] = assignDirectives(1);
  console.log("배정된 다양성 조건:", directive);

  const post = await generatePost(category, directive);

  console.log("\n=== 생성된 포스팅 ===");
  console.log("id:", post.id);
  console.log("title:", post.title);
  console.log("image_query:", post.image_query);
  console.log("tags:", post.tags_json);
  console.log("content 글자수:", post.content?.length);
  console.log("\n--- content ---\n");
  console.log(post.content);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
