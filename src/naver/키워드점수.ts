/**
 * **키워드 등급** — 찾는 사람에 비해 글이 적은 키워드가 위로 오게.
 *
 *     비율 = 블로그 문서 수 ÷ 월 검색량      (낮을수록 좋다)
 *     골드 0.5 미만 · 실버 0.5~1 · 브론즈 1~3 · 그 외 3 초과
 *     문서 수를 못 받았으면 «미확인» — 0 이 아니다.
 *
 * 화면에 기준을 그대로 적는다. 처음에는 점수식(로그·가중치)을 쓰려 했는데,
 * 사장님이 보시고 «왜 이 순서인지» 를 알 수가 없었다. 등급은 한눈에 읽힌다.
 * 순수 함수다(네트워크 없음).
 */
export type 등급 = "gold" | "silver" | "bronze" | "etc" | "unknown";

export const 등급이름: Record<등급, string> = {
  gold: "골드", silver: "실버", bronze: "브론즈", etc: "그 외", unknown: "미확인",
};

/** 글쓰기에 쓰는 차례. 그 외·미확인은 자동으로 쓰지 않는다. */
export const 쓰는등급: 등급[] = ["gold", "silver", "bronze"];

export function 비율(문서수: number | null | undefined, 검색량: number): number | null {
  if (문서수 === null || 문서수 === undefined || !Number.isFinite(문서수)) return null;
  if (검색량 <= 0) return null;
  return Math.round((문서수 / 검색량) * 1000) / 1000;
}

export function 등급매기기(값: number | null): 등급 {
  if (값 === null) return "unknown";
  if (값 < 0.5) return "gold";
  if (값 < 1) return "silver";
  if (값 <= 3) return "bronze";
  return "etc";
}

/** 줄 세우기: 등급 차례 → 같은 등급이면 검색량 많은 순. */
export function 등급순(a: { grade: 등급; pc: number; mobile: number }, b: { grade: 등급; pc: number; mobile: number }): number {
  const 차례: 등급[] = ["gold", "silver", "bronze", "etc", "unknown"];
  const d = 차례.indexOf(a.grade) - 차례.indexOf(b.grade);
  if (d !== 0) return d;
  return (b.pc + b.mobile) - (a.pc + a.mobile);
}

/** 월간 검색량 등급 — 지시문에 숫자 대신 넣는다. */
export function 검색량등급(검색량: number): "많음" | "보통" | "적음" {
  if (검색량 >= 10_000) return "많음";
  if (검색량 >= 1_000) return "보통";
  return "적음";
}

/**
 * **검색 의도** — 이 말로 찾는 사람이 **블로그 글을 누를까?**
 *
 * 사장님 실측(10-08): «롤전적검색OP» 는 비율로는 골드였고 메인에도 떴지만 유입 22회.
 * 그 말로 찾는 사람은 OP.GG 사이트로 **바로 가려는** 사람이라 블로그를 누르지 않는다.
 * 반대로 «직업·스킬 조합 추천» 처럼 **물음에 답을 찾는** 말은 블로그를 누른다.
 *
 *   nav  🚪 이동형 — 사이트·도구·다운로드·로그인으로 가려는 말. 자동 글쓰기에서 뺀다.
 *   info 📘 정보형 — 방법·추천·공략·조합·비교·정리처럼 답을 찾는 말. 먼저 쓴다.
 *   plain 그 밖.
 * 둘 다 걸리면 이동형이 이긴다(«전적검색 방법» 도 결국 사이트로 간다).
 */
export type 의도 = "nav" | "info" | "plain";
export const 의도이름: Record<의도, string> = { nav: "🚪 이동형", info: "📘 정보형", plain: "" };

const 이동형말 = [
  "전적검색", "전적", "사이트", "바로가기", "홈페이지", "홈피", "공식카페", "공식홈", "다운로드", "다운받기", "설치파일",
  "로그인", "회원가입", "고객센터", "접속", "링크", "주소", "나무위키", "위키", "유튜브", "인벤", "디시", "갤러리",
  "opgg", "op.gg", "포로지지", "닥지지", "데브시스터즈", "넥슨닷컴", "플레이스토어", "앱스토어", "apk", "pc버전",
];
const 정보형말 = [
  "방법", "하는법", "추천", "공략", "조합", "정리", "총정리", "비교", "후기", "리뷰", "티어", "세팅", "가이드", "팁", "꿀팁",
  "순위", "뜻", "차이", "초보", "육성", "빌드", "스킬", "직업", "클래스", "쿠폰", "리세", "리세마라", "사전예약", "보상",
  "출시일", "업데이트", "패치", "일정", "시간", "해결", "오류", "사양", "요금", "가격", "꿀템", "효율", "루트", "코스",
];

export function 의도보기(키워드: string): 의도 {
  const 말 = String(키워드 ?? "").replace(/\s+/g, "").toLowerCase();
  if (!말) return "plain";
  // 영문 «OP» 가 따로 붙은 꼴(롤전적검색OP)도 사이트 이름이다.
  if (이동형말.some((w) => 말.includes(w)) || /(^|[^a-z])op($|[^a-z])/.test(말)) return "nav";
  if (정보형말.some((w) => 말.includes(w))) return "info";
  return "plain";
}
