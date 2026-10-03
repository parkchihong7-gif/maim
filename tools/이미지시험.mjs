#!/usr/bin/env node
/**
 * 🖼️ 이미지 프롬프트를 **실제 Gemini 이미지 모델로** 그려 보는 시험 도구. 화면과 같은 프롬프트(src/web/public/image-prompt.js)를 쓴다.
 *
 *     GEMINI_API_KEY=… node tools/이미지시험.mjs [글.json] [출력폴더]
 *
 *   글.json  {"title": "...", "content": "...", "keyword": "..."} — 없으면 예시 글
 *   IMAGE_MODEL  기본 gemini-2.5-flash-image (16:9 지정)
 *   키는 환경 변수로만 받는다. 파일·채팅에 적지 않는다.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const 키 = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
if (!키) { console.error("GEMINI_API_KEY 환경 변수가 없습니다."); process.exit(2); }
const 모델 = process.env.IMAGE_MODEL || "gemini-2.5-flash-image";
const [, , 글파일, 출력 = "image-test-out"] = process.argv;

const 상자 = {};
vm.createContext(상자);
vm.runInContext(fs.readFileSync(new URL("../src/web/public/image-prompt.js", import.meta.url), "utf8"), 상자);
const 글 = 글파일 ? JSON.parse(fs.readFileSync(글파일, "utf8")) : {
  title: "전세 계약 체크리스트 계약 당일 순서대로 보는 법", keyword: "전세계약체크리스트",
  content: "전세 계약 전에 꼭 볼 것을 정리했어요.\n📌 등기부등본 먼저 보기\n계약 당일에 등기부등본을 다시 떼어 보세요.\n🕘 확정일자 받는 날\n전입신고와 같은 날 받는 것이 좋아요.\n✅ 보증보험 가입\n가입 조건을 미리 확인하세요.",
};
const 목록 = 상자.이미지프롬프트들(글.title, 글.content, 글.keyword, "gemini");
fs.mkdirSync(출력, { recursive: true });

for (const [i, x] of 목록.entries()) {
  const 시작 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${모델}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": 키 },
    body: JSON.stringify({
      contents: [{ parts: [{ text: x.글 }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
    }),
  });
  const 답 = await res.json().catch(() => ({}));
  const 그림 = (답?.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
  if (!res.ok || !그림) {
    console.log(`❌ ${i + 1}. ${x.역할} — ${res.status} ${JSON.stringify(답?.error ?? 답?.promptFeedback ?? "그림 없음").slice(0, 200)}`);
    continue;
  }
  const 파일 = path.join(출력, `${i + 1}-${x.역할.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 30)}.png`);
  fs.writeFileSync(파일, Buffer.from(그림.inlineData.data, "base64"));
  fs.writeFileSync(파일.replace(/\.png$/, ".txt"), x.글);
  console.log(`✅ ${i + 1}. ${x.역할} — ${파일} (${Math.round((Date.now() - 시작) / 1000)}초)`);
}
