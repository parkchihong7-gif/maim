/**
 * **🖼️ 이미지 프롬프트** 를 시험한다 — 16:9 · 사실적 · 이미지마다 따로 · 잘림 없음 · AI 별 말투.
 *
 *     npx tsx tests/test-이미지프롬프트.ts
 */
import fs from "node:fs";
import vm from "node:vm";

const 상자: any = {};
vm.createContext(상자);
vm.runInContext(fs.readFileSync("src/web/public/image-prompt.js", "utf8"), 상자);

let 틀린것 = 0;
function 참(말: string, 값: boolean) { if (값) console.log(`   ✅ ${말}`); else { console.log(`   ❌ ${말}`); 틀린것 += 1; } }

const 긴문단 = "가".repeat(400);
const 본문 = `전세 계약 전에 꼭 볼 것을 정리했어요.\n📌 등기부등본 먼저 보기\n계약 당일에 등기부등본을 다시 떼어 보세요. 근저당이 새로 잡혔을 수 있어요.\n🕘 확정일자 받는 날\n${긴문단}\n✅ 보증보험 가입\n가입 조건을 미리 확인하세요.\n💡 하나 더\n넷째 소제목입니다.`;
const g = 상자.이미지프롬프트들("전세 계약 체크리스트 계약 당일 순서대로 보는 법", 본문, "#전세계약체크리스트", "gemini");

console.log("\n① 이미지마다 따로 · 짧게");
참(`대표 1 + 본문 3 = 4장 (${g.length})`, g.length === 4 && g[0].역할 === "대표 이미지" && g[1].역할.includes("등기부등본"));
참(`한 장에 900자 이내 (${g.map((x: any) => x.글.length).join(",")})`, g.every((x: any) => x.글.length <= 900));
참("본문을 뭉텅이로 붙이지 않는다(400자 문단이 안 들어감)", g.every((x: any) => !x.글.includes("가가가가가")));
참("설명은 문장 끝까지만(중간에 안 잘림)", g[1].글.includes("(글 내용: 계약 당일에 등기부등본을 다시 떼어 보세요.)") && !g[2].글.includes("글 내용"));

console.log("\n② 사장님 기준 — 16:9 · 사실적 · 애니·과한 액션 금지 · 홍보 이미지 수준");
참("모두 16:9", g.every((x: any) => x.글.includes("16:9")));
참("실제 사진을 포토샵으로 다듬은 듯 · 기업 홈페이지 홍보 배너 수준", g.every((x: any) => x.글.includes("포토샵") && x.글.includes("기업 공식 홈페이지")));
참("애니·일러스트·네온·과장된 동작을 피하라고", g.every((x: any) => ["애니메이션", "일러스트", "네온", "과장된 동작"].every((k) => x.글.includes(k))));
참("대표만 짧은 제목 글자, 본문은 글자 없음", g[0].글.includes("«전세계약체크리스트»") && g.slice(1).every((x: any) => x.글.includes("글자를 넣지 마세요")));
참("모든 이미지에 «AI 생성 이미지» 표시", g.every((x: any) => x.글.includes("AI 생성 이미지")));

console.log("\n③ 쓰는 이미지 AI 에 맞춘 말투");
const c = 상자.이미지프롬프트들("전세 계약 특약 처음이라면 이 순서로 써 보세요", 본문, "", "chatgpt");
const o = 상자.이미지프롬프트들("제목", 본문, "키워드", "other");
참("Gemini: «이미지 1장을 만들어 주세요»", g[0].글.startsWith("아래 설명대로 이미지 1장을 만들어 주세요"));
참("ChatGPT: «바로 생성 · 1792×1024»", c[0].글.includes("바로 생성") && c[0].글.includes("1792×1024"));
참("그 밖: 영어 머리말 + Aspect ratio", o[0].글.startsWith("Create one image") && o[0].글.includes("Aspect ratio 16:9"));
참("키워드가 없으면 제목 앞부분을 낱말 단위로 짧게(16자 이내)", c[0].글.includes("«전세 계약 특약 처음이라면»"));
const 없음 = 상자.이미지프롬프트들("제목", "소제목이 없는 글입니다. 그냥 문단.", "키워드", "gemini");
참("소제목이 없어도 대표 + 본문 1장", 없음.length === 2);

console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
