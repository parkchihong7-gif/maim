/**
 * 🕹️ 게임 목록 — 게임마다 «이름» 과 «창 제목 글자» 만 둔다 (2026-10-21 게임 스샷 개편).
 *
 * 집 PC 프로그램은 단축키를 누른 순간 **맨 앞 창의 제목**을 보내고, 서버가 그 제목에
 * «창 제목 글자» 가 들어 있는 게임을 찾는다. 아무 게임에도 안 맞으면 «기타»(id `etc`)에 넣는다.
 * 표는 예전 것(game_profiles)을 그대로 쓴다 — 예전 모양의 profile_json 도 이름·창제목만 읽는다.
 */

export interface 게임 {
  id: string;
  이름: string;
  /** 게임 창 제목에 들어 있는 말(부분 일치, 대소문자 무시). 비어 있으면 그 게임으로는 안 찾는다 */
  창제목: string;
}

/** 목록에 없는 창에서 찍은 스샷이 들어가는 자리 */
export const 기타 = { id: "etc", 이름: "기타" } as const;

export const 기본게임들: 게임[] = [
  { id: "dokkaebi", 이름: "도깨비의세계", 창제목: "도깨비의세계 -" },
  { id: "aniimo", 이름: "애니모", 창제목: "Aniimo" },
];

export function 게임다듬기(값: Partial<게임>, 원래?: 게임): 게임 {
  return {
    id: 원래?.id ?? String(값.id ?? ""),
    이름: String(값.이름 ?? 원래?.이름 ?? "").trim().slice(0, 30),
    창제목: String(값.창제목 ?? 원래?.창제목 ?? "").trim().slice(0, 60),
  };
}

/** 창 제목으로 게임 찾기 — 창 제목 글자가 긴 것부터 본다(«도깨비의세계 -» 가 «도깨비» 보다 먼저). */
export function 창으로게임(창: string, 게임들: 게임[]): 게임 | null {
  const 제목 = 창.toLowerCase();
  return [...게임들]
    .filter((g) => g.창제목)
    .sort((a, b) => b.창제목.length - a.창제목.length)
    .find((g) => 제목.includes(g.창제목.toLowerCase())) ?? null;
}
