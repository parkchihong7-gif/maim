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
