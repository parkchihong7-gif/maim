/**
 * **포스팅 방향 다양화** — "포스팅 방향 설정"에서 프리셋 하나를 고정해 두면
 * 매 글에 토씨 하나 안 틀리고 같은 지시문 한 줄이 들어간다("전문가 분석형"
 * 의 경우 "전문가가 분석하듯 근거와 배경을 짚어가며 구조적으로 설명하고…").
 * 30편쯤 쌓이면 그 지시 하나가 매번 똑같은 글의 뼈대로 드러나 "AI 가 쓴
 * 티"가 난다 — 실제로 겪은 일이다.
 *
 * 해법은 변주.ts(src/pipeline/변주.ts) 와 같다 — **AI 의 자유 선택이 아니라
 * 코드가** 최근 글에서 덜 쓴 것을 고른다. 두 층이 있다.
 *   1) 프리셋 하나를 골라 두셨으면 그 프리셋의 "뜻은 같지만 표현이 다른"
 *      문구 중 최근에 덜 쓴 것을 고른다.
 *   2) "랜덤" 을 고르셨으면 프리셋 자체도 최근 글과 겹치지 않게 고른다.
 */
import { getAllPostingDirectionPresets } from "../db/repositories/settings.js";
import { 최근글들 } from "../db/repositories/posts.js";
import { 덜쓴것 } from "../pipeline/변주.js";

export interface 방향기록 { presetId: string; variant: number }
export interface 방향고름 { presetId: string | null; instruction: string | null; 기록: 방향기록 | null }

/** 최근 글들이 실제로 썼던 프리셋+문구 번호. variation_json 의 direction 으로 남겨 둔 것만 본다. */
export function 최근방향들(개수 = 8): 방향기록[] {
  return 최근글들(개수).flatMap((g) => {
    try {
      const 기록 = JSON.parse(g.variation_json ?? "null") as { direction?: Partial<방향기록> } | null;
      const d = 기록?.direction;
      return d && typeof d.presetId === "string" && typeof d.variant === "number" ? [d as 방향기록] : [];
    } catch { return []; }
  });
}

/**
 * 저장된 `posting_direction_preset` 값으로 이번 글이 쓸 지시문을 고른다.
 * 값이 없으면(= 프리셋 안 고름) 예전과 같이 아무 지시도 안 준다.
 */
export function 방향고르기(저장된id: string | null, 최근: 방향기록[] = 최근방향들()): 방향고름 {
  if (!저장된id) return { presetId: null, instruction: null, 기록: null };
  const 전체 = getAllPostingDirectionPresets();
  let 프리셋 = 전체.find((p) => p.id === 저장된id);
  if (!프리셋) return { presetId: null, instruction: null, 기록: null };

  // "랜덤" — 프리셋 자체도 매 글 최근과 겹치지 않게 고른다(랜덤 자신은 후보에서 뺀다).
  if (저장된id === "random") {
    const 후보 = 전체.filter((p) => p.id !== "random").map((p) => p.id);
    if (후보.length === 0) return { presetId: null, instruction: null, 기록: null };
    const 최근프리셋id들 = 최근.map((r) => r.presetId);
    const 고른id = 덜쓴것(후보, 최근프리셋id들);
    프리셋 = 전체.find((p) => p.id === 고른id)!;
  }

  const 문구들 = 프리셋.instructions.length > 0 ? 프리셋.instructions : [프리셋.instruction];
  if (!문구들.some((x) => x.trim())) {
    // balanced 처럼 문구가 다 빈 문자열이면 고를 것도 기록할 것도 없다.
    return { presetId: 프리셋.id, instruction: null, 기록: null };
  }
  const 이프리셋최근변주 = 최근.filter((r) => r.presetId === 프리셋!.id).map((r) => r.variant);
  const 변주idx들 = 문구들.map((_, i) => i);
  const 고른idx = 덜쓴것(변주idx들, 이프리셋최근변주);
  return {
    presetId: 프리셋.id,
    instruction: 문구들[고른idx] || null,
    기록: { presetId: 프리셋.id, variant: 고른idx },
  };
}
