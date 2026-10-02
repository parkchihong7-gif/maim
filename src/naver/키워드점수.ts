/**
 * **키워드 점수** — 찾는 사람은 있고 글은 적은 키워드가 위로 오게.
 *
 * 순수 함수다(네트워크 없음). 2단계 보관함이 이것으로 줄을 세운다.
 * 아래 숫자는 첫 출발값이다. 배포 뒤 실제 결과를 보며 고친다.
 *
 *     점수   = log10(검색량) × 경쟁가중 × 포화가중
 *     포화도 = 문서 수 ÷ 검색량
 */
export const 경쟁가중: Record<string, number> = { 낮음: 1.2, 중간: 1.0, 높음: 0.8 };

export function 포화가중(포화도: number): number {
  if (포화도 <= 5) return 1.3;
  if (포화도 <= 20) return 1.0;
  if (포화도 <= 50) return 0.7;
  return 0.4;
}

export function 포화도(문서수: number, 검색량: number): number {
  if (검색량 <= 0) return Infinity;
  return 문서수 / 검색량;
}

export function 키워드점수(입력: { pc: number; mobile: number; comp: string; docTotal: number }): number {
  const 검색량 = Math.max(0, (입력.pc || 0) + (입력.mobile || 0));
  if (검색량 < 1) return 0;
  const 경쟁 = 경쟁가중[입력.comp] ?? 1.0;
  const 점수 = Math.log10(검색량) * 경쟁 * 포화가중(포화도(입력.docTotal || 0, 검색량));
  return Math.round(점수 * 100) / 100;
}

/** 월간 검색량 등급 — 지시문에 숫자 대신 넣는다. */
export function 검색량등급(검색량: number): "많음" | "보통" | "적음" {
  if (검색량 >= 10_000) return "많음";
  if (검색량 >= 1_000) return "보통";
  return "적음";
}
