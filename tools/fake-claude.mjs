#!/usr/bin/env node
// 로컬 화면 시험용 가짜 Claude. 진짜 AI 없이 [지금 생성]·상태창·초안 카드를 확인할 때 쓴다.
//   CLAUDE_BIN=tools/fake-claude.mjs  FAKE_SLEEP=3000(ms, 느리게)  FAKE_MODE_FILE=파일(내용 broken 이면 엉터리 답)
// 조사 단계(«자료만 빠르게»)에는 메모·소식을, 글쓰기에는 고정된 글 한 편을 돌려준다.
import fs from "node:fs";
const 잠 = Number(process.env.FAKE_SLEEP||0); if (잠) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,잠);
{ const a=process.argv.slice(2); const q=a[a.indexOf("-p")+1]||"";
  if (q.includes("자료만 빠르게")) { process.stdout.write(JSON.stringify({ is_error:false, num_turns:4, result: JSON.stringify({ blog_brief: q.includes("■ blog_brief") ? "(블로그) 생활 정보. ".repeat(10) : "", brief: q.includes("■ brief") ? "(KOSIS) 물가 2.1% 상승. ".repeat(8) : "", news: q.includes("■ news") ? "(2026-09-30, 연합뉴스) 물가 둔화" : "" }) })); process.exit(0); } }
{ const a=process.argv.slice(2); const q=a[a.indexOf("-p")+1]||"";
  if (q.includes("[글 준비 요청]")) { process.stdout.write(JSON.stringify({ is_error:false, result: JSON.stringify({
    questions:["계약 전에 무엇부터 확인하나요?","확정일자는 언제 받나요?","보증보험은 꼭 들어야 하나요?","특약은 어떻게 쓰나요?","문제가 생기면 어디에 묻나요?"],
    common:["등기부등본 확인","확정일자·전입신고","보증보험 가입","특약 예시","중개사 확인"],
    gaps:["계약 당일 시간 순서 체크리스트가 없다","보증보험 거절 사례를 다루지 않는다","특약 문구의 효력 한계를 설명하지 않는다","지역별 전세가율 확인법이 없다"],
    facts:[{text:"확정일자는 전입신고와 같은 날 받는 것이 일반적이다",src:2},{text:"보증보험은 전세가율 등 조건에 따라 거절될 수 있다",src:3},{text:"등기부등본은 계약 당일 다시 떼어 보는 것이 권장된다",src:1}],
    titles:["전세 계약 체크리스트 계약 당일 순서대로 보는 법","전세 계약 주의사항 놓치기 쉬운 4가지","전세 계약 전 서류 확인 처음이라면 이 순서로"],
    outline:[{heading:"📌 계약 전날까지 확인할 것",point:"서류와 시세 확인"},{heading:"🕘 계약 당일 순서",point:"시간 순서 체크리스트"},{heading:"🛡️ 보증보험·특약",point:"거절 사례와 특약 한계"},{heading:"✅ 계약 뒤 할 일",point:"전입신고·확정일자와 정리"}],
    need:["직접 전세 계약을 해 본 적이 있나요? 그때 가장 헷갈린 점은?","사는 지역(구 단위)과 전세 시세를 알려 주세요","보증보험에 가입해 본 경험이 있나요?"],
    tags:["전세계약","전세체크리스트","확정일자","전세보증보험","세입자"] }) })); process.exit(0); }
  if (q.includes("[구간 작성 요청]")) { const m=q.match(/\[이 구간\] (.+)/); const h=m?m[1]:"📌 구간";
    process.stdout.write(JSON.stringify({ is_error:false, result: JSON.stringify({ text: h+"\n"+"이 구간에서는 핵심을 쉽게 정리해요. 확정일자는 전입신고와 같은 날 받는 경우가 많아요 [자료 2].\n✅ 확인할 것: 서류, 날짜, 금액.\n".repeat(4) }) })); process.exit(0); } }
{ const a=process.argv.slice(2); const q=a[a.indexOf("-p")+1]||"";
  if (q.includes("[스타일 분석 요청]")) { process.stdout.write(JSON.stringify({ is_error:false, result: JSON.stringify({
    style: { topic:"전세·월세 계약과 대출 등 세입자 실무 정보", readers:"처음 전세 계약을 앞둔 20~30대 세입자", tone:"친근한 구어체 «~해요», 독자에게 말 걸듯",
      title_style:"핵심 대상 + 숫자(3가지·10가지) 또는 «이렇게 보세요» 같은 안내형", sentence_style:"짧은 문장, 결론 먼저, 물음으로 이어 가기",
      paragraph_style:"📌·✅ 이모지로 소제목·목록을 열고 문단은 2~3줄", experience_style:"«저도 헷갈렸는데요» 처럼 가벼운 공감, 구체 경험은 적음",
      habits:"«정리해 볼게요», «결론부터 말씀드리면», «댓글로 남겨 주세요»", avoid:"법률 단정, 과장된 숫자", conditions:"서류 이름은 정확히, 바뀐 제도는 연도를 밝히기" },
    summary:"세입자 눈높이로 계약·대출 실무를 쉽게 풀어 주는 정보형 블로그예요.",
    strengths:["결론을 먼저 말해 읽기 쉽다","체크리스트 형식이 많아 저장·공유하기 좋다","말투가 일정해 신뢰감이 있다"],
    improvements:[{title:"본문 길이가 짧은 글이 있다",why:"검색한 사람이 다른 글로 넘어간다",how:"사례·예외 조건 문단을 하나 더"},
      {title:"출처 표시가 적다",why:"제도 숫자는 바뀐다",how:"기관명·기준일을 한 줄로"},
      {title:"제목이 비슷하다",why:"같은 키워드끼리 겹친다",how:"대상·상황을 제목 앞에"},
      {title:"직접 경험이 적다",why:"차별화가 약하다",how:"실제 겪은 장면 한 단락"},
      {title:"카테고리 쏠림",why:"부동산 기초에 몰림",how:"대출·생활 글도 주기적으로"},
      {title:"마무리가 같다",why:"반복 표현",how:"다음 글 안내·요약 박스로 바꿔 보기"}],
    priority:["출처·기준일 한 줄 넣기","글마다 예외 조건 문단 추가","제목에 대상·상황 넣기"], confidence:0.72 }) })); process.exit(0); } }
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
