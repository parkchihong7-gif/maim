#!/usr/bin/env node
// 로컬 화면 시험용 가짜 Claude. 진짜 AI 없이 [지금 생성]·상태창·초안 카드를 확인할 때 쓴다.
//   CLAUDE_BIN=tools/fake-claude.mjs  FAKE_SLEEP=3000(ms, 느리게)  FAKE_MODE_FILE=파일(내용 broken 이면 엉터리 답)
// 조사 단계(«자료만 빠르게»)에는 메모·소식을, 글쓰기에는 고정된 글 한 편을 돌려준다.
import fs from "node:fs";
const 잠 = Number(process.env.FAKE_SLEEP||0); if (잠) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,잠);
{ const a=process.argv.slice(2); const q=a[a.indexOf("-p")+1]||"";
  if (q.includes("자료만 빠르게")) { process.stdout.write(JSON.stringify({ is_error:false, num_turns:4, result: JSON.stringify({ blog_brief: q.includes("■ blog_brief") ? "(블로그) 생활 정보. ".repeat(10) : "", brief: q.includes("■ brief") ? "(KOSIS) 물가 2.1% 상승. ".repeat(8) : "", news: q.includes("■ news") ? "(2026-09-30, 연합뉴스) 물가 둔화" : "" }) })); process.exit(0); } }
{ const a=process.argv.slice(2); const q=a[a.indexOf("-p")+1]||"";
  if (q.includes("[검수 요청]")) { process.stdout.write(JSON.stringify({ is_error:false, result: JSON.stringify({ summary: "사실 확인이 필요한 숫자 2곳과 단정 표현 1곳이 있어요.", items: [
    { kind:"fact", quote:"전년보다 40% 늘었다", why:"조사 자료에 없는 숫자입니다.", fix:"출처를 넣거나 숫자를 빼세요." },
    { kind:"fact", quote:"2025년 기준", why:"오늘 기준으로 낡았을 수 있습니다.", fix:"최신 연도인지 확인하세요." },
    { kind:"experience", quote:"제가 직접 계약해 보니", why:"AI 가 쓴 경험 문장입니다.", fix:"실제 경험이 아니면 «계약해 본 분들은» 으로." },
    { kind:"exaggeration", quote:"100% 안전합니다", why:"단정 표현입니다.", fix:"«위험을 크게 줄입니다» 로." } ] }) })); process.exit(0); } }
const mode = fs.existsSync(process.env.FAKE_MODE_FILE) ? fs.readFileSync(process.env.FAKE_MODE_FILE,"utf8").trim() : "sloppy";
if (mode === "broken") { process.stdout.write(JSON.stringify({ is_error: false, result: "죄송합니다, 지금은 글을 쓸 수 없습니다." })); process.exit(0); }
const 본문 = "가짜 본문입니다. 노원구 소형 아파트 대출 조건을 정리합니다. ".repeat(60);
const 글 = { title: "노원구 소형 아파트 대출 조건", content: 본문,
  image_query: "노원구 소형 아파트 대출 조건을 설명하는 사진으로 밝은 분위기의 아파트 단지 외관과 은행 창구 상담 장면이 함께 보이면 좋음",
  tags: ["노원구아파트", "대출조건", "#소형아파트", "생애최초"],
  title_variants: [{type:"조건·기준형",title:"노원구 아파트 대출 한도 기준"},{type:"방법·절차형",title:"노원구 아파트 대출 신청 방법"},{title:"노원구 아파트 대출 후기 비교"}] };
{ const a=process.argv.slice(2); const q=a[a.indexOf("-p")+1]||""; if (q.includes("[자료 메모 남기기]")) 글.brief = "(KOSIS) 2026년 9월 소비자물가 2.1% 상승. ".repeat(6); }
process.stdout.write(JSON.stringify({ is_error: false, result: JSON.stringify(글) }));
