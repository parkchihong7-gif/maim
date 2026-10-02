/**
 * **네이버 키워드 1단계 — 키 넣기·연결 테스트를 시험한다.**
 *
 *     npx tsx tests/test-네이버연결.ts
 *
 * 인터넷이 필요 없다. 네이버 대신 `tools/fake-naver.json`(NAVER_FAKE=1)을 쓰고,
 * 임시 폴더에 DB 를 새로 만들어 서버를 메모리 안에서 띄워(inject) 부른다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// config 가 import 되는 순간 환경변수를 읽는다. 그 전에 임시 자리로 돌려 둔다.
const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-naver-"));
process.env.DATA_DIR = 임시;
process.env.DASHBOARD_TOKEN = "owner-test-token-naver";
delete process.env.KEYSERVER_URL;
for (const 이름 of ["NAVER_SEARCH_CLIENT_ID", "NAVER_SEARCH_CLIENT_SECRET", "NAVER_AD_API_KEY",
                   "NAVER_AD_SECRET", "NAVER_AD_CUSTOMER_ID", "NAVER_FAKE"]) delete process.env[이름];

const { getDb } = await import("../src/db/index.js");
const 키 = await import("../src/naver/키.js");
const { 블로그검색, 태그빼기 } = await import("../src/naver/블로그검색.js");
const 광고 = await import("../src/naver/검색광고.js");
const 점수 = await import("../src/naver/키워드점수.js");
const { openSession } = await import("../src/db/repositories/keyserverSessions.js");
const { buildServer } = await import("../src/web/server.js");

getDb();

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

console.log("\n① 키 검사 — 칸마다 길이가 다르다");
참("검색 API Secret 10자는 통과", 키.네이버키검사("naver_search_client_secret", "Ab3dEf7hIj") === "");
참("한글이 섞이면 막는다", 키.네이버키검사("naver_search_client_id", "여기에붙여넣기abcdefgh").includes("글자"));
참("빈칸이 섞이면 막는다", 키.네이버키검사("naver_ad_api_key", "abc def ghi jkl mno pqr stu").includes("빈칸"));
참("CUSTOMER_ID 숫자는 통과", 키.네이버키검사("naver_ad_customer_id", "1234567") === "");
참("CUSTOMER_ID 에 글자가 있으면 막는다", 키.네이버키검사("naver_ad_customer_id", "12ab34") !== "");
참("광고 API 키가 짧으면 막는다", 키.네이버키검사("naver_ad_api_key", "short123").includes("짧"));

console.log("\n② 검색광고 서명·숫자 다듬기");
const 기대 = crypto.createHmac("sha256", "비밀").update("1700000000000.GET./keywordstool").digest("base64");
참("서명 = HMAC-SHA256(timestamp.METHOD.uri) base64", 광고.서명("1700000000000", "GET", "/keywordstool", "비밀") === 기대);
참("«< 10» 검색량은 5 로", 광고.검색량숫자("< 10") === 5);
참("숫자 검색량은 그대로", 광고.검색량숫자(1234) === 1234);
const 씨앗 = 광고.씨앗다듬기(["전세 계약", "전세계약", "a", "b", "c", "d", "e"]);
참("씨앗은 띄어쓰기 빼고 겹친 것 하나로, 5개까지", 씨앗.length === 5 && 씨앗[0] === "전세계약");
참("태그·&quot; 걷어 내기", 태그빼기("<b>전세</b> &quot;특약&quot;") === "전세 \"특약\"");

console.log("\n③ 등급 — 비율 = 문서 수 ÷ 월 검색량");
참("0.38 → 골드", 점수.등급매기기(점수.비율(1520, 3980)) === "gold");
참("0.79 → 실버", 점수.등급매기기(0.79) === "silver");
참("2.36 → 브론즈", 점수.등급매기기(2.36) === "bronze");
참("14.9 → 그 외", 점수.등급매기기(14.9) === "etc");
참("문서 수를 못 받으면 미확인(0 이 아님)", 점수.비율(null, 3980) === null && 점수.등급매기기(null) === "unknown");

console.log("\n④ 키가 없으면 — 예외 없이 사유만");
const 없음1 = await 블로그검색("블로그", 1);
const 없음2 = await 광고.연관키워드(["블로그"]);
참("블로그 검색: ok=false, «아직 없습니다»", !없음1.ok && 없음1.why.includes("아직 없습니다"));
참("검색광고: ok=false, «아직 다 들어 있지 않습니다»", !없음2.ok && 없음2.why.includes("들어 있지 않습니다"));

console.log("\n⑤ 가짜 모드(NAVER_FAKE=1)");
process.env.NAVER_FAKE = "1";
const 블 = await 블로그검색("전세 계약", 10);
참("블로그 검색 total 을 읽는다", 블.ok && 블.total === 48210);
참("상위 글 제목의 <b> 가 빠졌다", 블.ok && 블.items[0].title === "전세 계약 주의사항 7가지 정리");
const 연 = await 광고.연관키워드(["전세계약"]);
참("연관 키워드 9개", 연.ok && 연.rows.length === 9);
참("«< 10» 이 5 로 들어왔다", 연.ok && 연.rows.find((r) => r.keyword === "전세확정일자")?.pc === 5);

console.log("\n⑥ 서버 — 주인은 되고 체험은 403");
const app = await buildServer();
const 주인머리 = { "x-dashboard-token": "owner-test-token-naver" };
const 체험토큰 = openSession({ key1: "TRIAL-1", key2: "TRIAL-1-PC", remoteToken: "r", role: "client" });
const 체험머리 = { "x-dashboard-token": 체험토큰 };

const 시험 = await app.inject({ method: "POST", url: "/api/settings/test-naver", headers: 주인머리 });
const 시험답 = 시험.json();
참("주인 연결 테스트: 두 API 모두 ✅", 시험.statusCode === 200 && 시험답.ok && 시험답.search.ok && 시험답.ad.ok);
참("가짜 모드라고 알려 준다", 시험답.fake === true);

const 체험시험 = await app.inject({ method: "POST", url: "/api/settings/test-naver", headers: 체험머리 });
참("체험 연결 테스트는 403", 체험시험.statusCode === 403);

const 체험저장 = await app.inject({ method: "PUT", url: "/api/settings", headers: 체험머리,
  payload: { naver_search_client_id: "abcdefghijklmnop" } });
참("체험이 네이버 키를 저장하면 403", 체험저장.statusCode === 403);

const 나쁜키 = await app.inject({ method: "PUT", url: "/api/settings", headers: 주인머리,
  payload: { naver_search_client_id: "여기에붙여넣기abcdefgh" } });
참("주인이 한글 섞인 키를 넣으면 400", 나쁜키.statusCode === 400);

const 진짜같은키 = "ABCDefgh1234567890xy";
const 저장 = await app.inject({ method: "PUT", url: "/api/settings", headers: 주인머리,
  payload: { naver_search_client_id: `  ${진짜같은키}  `, naver_search_client_secret: "Ab3dEf7hIj" } });
참("주인이 키를 저장하면 200", 저장.statusCode === 200);

const 주인설정 = (await app.inject({ method: "GET", url: "/api/settings", headers: 주인머리 })).json();
const 칸 = 주인설정.naver?.naver_search_client_id;
참("저장됐다고 보인다", !!칸?.set);
참("앞 4자만 보이고 나머지는 가려진다", 칸?.value?.startsWith("ABCD") && !칸?.value?.includes(진짜같은키));

const 체험설정 = (await app.inject({ method: "GET", url: "/api/settings", headers: 체험머리 })).json();
const 체험칸 = 체험설정.naver?.naver_search_client_id;
참("체험 자리에는 값도, 있는지 여부도 안 보인다", 체험칸 && 체험칸.set === false && 체험칸.value === null);

await app.close();
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
