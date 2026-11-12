/**
 * **이미 쓴 사진은 걸러내고, 새 사진이 바닥나면 그제서야 다시 쓰는지** 시험한다.
 *
 *     npx tsx tests/test-이미지중복방지.ts
 *
 * 200편 넘게 쌓이면서 같은 무료 스톡 사진이 여러 글에 반복돼 쓰인다는 지적을
 * 받고 추가 — `attachImage.ts` 가 `이미쓴소스들()`(그동안 쓴 "site:sourceId"
 * 집합)을 `searchWithFallback()` 에 `exclude` 로 넘기면, 검색 결과에서
 * 그 사진들을 빼고 고른다. 완전히 새 사진이 하나도 안 남으면(극단적으로
 * 좁은 주제 등) 그제서야 전에 쓴 사진으로라도 채워 **글 자체가 막히지는
 * 않게** 한다. 인터넷은 필요 없다(가짜 fetch).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-imgdedupe-"));
process.env.DATA_DIR = 임시;
process.env.UNSPLASH_ACCESS_KEY = "fake-key";
delete process.env.PEXELS_API_KEY;
delete process.env.PIXABAY_API_KEY;

const { searchWithFallback } = await import("../src/images/searchImages.js");

// Unsplash 검색엔 항상 같은 사진 3장(a·b·c)을 돌려주고, 사진 자체(https://img/..)는
// 아무 바이트나 받아온 걸로 흉내 낸다.
const 원래fetch = global.fetch;
let 검색호출수 = 0;
global.fetch = (async (url: string | URL) => {
  const u = String(url);
  if (u.startsWith("https://api.unsplash.com/search/photos")) {
    검색호출수++;
    return {
      ok: true,
      json: async () => ({
        results: [
          { id: "a", urls: { regular: "https://img/a" }, links: { html: "https://page/a" } },
          { id: "b", urls: { regular: "https://img/b" }, links: { html: "https://page/b" } },
          { id: "c", urls: { regular: "https://img/c" }, links: { html: "https://page/c" } },
        ],
      }),
    } as unknown as Response;
  }
  if (u.startsWith("https://img/")) {
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) } as unknown as Response;
  }
  throw new Error(`예상 못 한 fetch: ${u}`);
}) as typeof fetch;

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① 제외 없이 2장 요청 — 풀에 있는 a·b·c 모두(검색 결과는 늘 넉넉히 받아 둔다)");
const dir1 = path.join(임시, "d1");
const r1 = await searchWithFallback("테스트 주제", dir1, 2, 1, new Set());
참("최소 2장 이상 받았다(AI 선택을 위해 여유 있게 받아 둔다)", r1.length >= 2);
참("a·b·c 안에서 받았다", r1.every((c) => ["a", "b", "c"].includes(c.sourceId)));

console.log("\n② a를 이미 썼다고 하고 2장 — a는 빠지고 b·c만 받는다");
const dir2 = path.join(임시, "d2");
const r2 = await searchWithFallback("테스트 주제", dir2, 2, 1, new Set(["unsplash:a"]));
참("2장 받았다", r2.length === 2);
참("제외한 a는 안 받았다", r2.every((c) => c.sourceId !== "a"));
참("b·c를 받았다", new Set(r2.map((c) => c.sourceId)).size === 2
  && r2.every((c) => ["b", "c"].includes(c.sourceId)));

console.log("\n③ a·b·c 전부 이미 썼다고 하고 2장 — 새 사진이 없으니 그제서야 전에 쓴 걸로 채운다");
const dir3 = path.join(임시, "d3");
const r3 = await searchWithFallback(
  "테스트 주제", dir3, 2, 1, new Set(["unsplash:a", "unsplash:b", "unsplash:c"]),
);
참("그래도 2장을 채웠다(글이 막히지 않는다)", r3.length === 2);
참("전에 쓴 a·b·c 중에서 채웠다", r3.every((c) => ["a", "b", "c"].includes(c.sourceId)));

global.fetch = 원래fetch;
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
