/**
 * **🎮 출시 계획 — 게임 하나를 넣으면 A~F 여섯 단계 글이 날짜에 맞춰 열린다.**
 *
 * 사장님 실측(10-08): «도깨비의 세계» 는 출시 전날 «직업·스킬 조합» 글로 유입 2,810.
 * 그런데 당일 오후 경쟁 글이 몰리자 메인에서 밀렸다. 그래서 한 편으로 끝내지 않고,
 * 사람들이 **그날그날 찾는 것**에 맞춰 여섯 편을 이어 쓴다.
 *
 *   A  D-14~D-4   출시 예정 총정리       (출시일·플랫폼·사전예약·어떤 게임인지)
 *   B  D-4~D-2    사전예약·보상·사전 다운로드
 *   C  D-2~D-1    직업·클래스 추천·조합   ← 출시 전날이 가장 많이 찾는 때
 *   D  D-day      출시 당일 초보 가이드
 *   E  D+1~D+2    쿠폰·리세마라·티어
 *   F  D+3~D+7    공략·문제 해결·후기
 *
 * 순수 함수다(DB·네트워크 없음). 날짜는 «YYYY-MM-DD».
 */
import { DateTime } from "luxon";

export interface 단계정의 {
  key: "A" | "B" | "C" | "D" | "E" | "F";
  이름: string;
  /** 권장일(출시일 기준 날 수) */
  날: number;
  /** 열려 있는 기간 [시작, 끝] (출시일 기준) */
  창: [number, number];
  /** 키워드 꼬리 — «게임 이름 + 꼬리» */
  꼬리: string;
  각도: string;
  제목예: string;
}

export const 단계들: 단계정의[] = [
  { key: "A", 이름: "출시 예정 총정리", 날: -10, 창: [-14, -4], 꼬리: "출시일",
    각도: "출시 전 총정리 — 출시일·플랫폼·사전예약 여부·어떤 게임인지 한눈에. 아직 안 나온 정보는 «공식 발표 전» 으로",
    제목예: "{게임} 출시일 확정? 사전예약·플랫폼 총정리" },
  { key: "B", 이름: "사전예약·보상·사전 다운로드", 날: -3, 창: [-4, -2], 꼬리: "사전예약",
    각도: "사전예약 보상·쿠폰·사전 다운로드·출시 시간 — 출시 전에 미리 해 둘 것",
    제목예: "{게임} 사전예약 보상·사전 다운로드 방법 3가지" },
  { key: "C", 이름: "직업·클래스 추천·조합", 날: -1, 창: [-2, -1], 꼬리: "직업 추천",
    각도: "직업·클래스·캐릭터 추천과 조합 — 처음 고를 때 후회하지 않는 선택 기준 (출시 전날이 가장 많이 찾는 때)",
    제목예: "{게임} 직업 추천, 출시 전에 정해 두면 좋은 조합 3가지" },
  { key: "D", 이름: "출시 당일 초보 가이드", 날: 0, 창: [0, 0], 꼬리: "초보 가이드",
    각도: "출시 당일 초보 가이드 — 오픈 시간·서버·첫날 할 일 순서, 놓치기 쉬운 보상",
    제목예: "{게임} 오늘 출시, 초보 첫날 할 일 5가지" },
  { key: "E", 이름: "쿠폰·리세마라·티어", 날: 1, 창: [1, 2], 꼬리: "쿠폰",
    각도: "쿠폰 코드·리세마라·티어 — 출시 직후 가장 많이 묻는 것 (확인된 쿠폰만, 지어내지 말 것)",
    제목예: "{게임} 쿠폰 코드·리세마라 티어 정리" },
  { key: "F", 이름: "공략·문제 해결·후기", 날: 3, 창: [3, 7], 꼬리: "공략",
    각도: "공략·막히는 곳 해결·효율 좋은 진행 순서, 일주일 해 본 솔직한 평가",
    제목예: "{게임} 공략, 막히는 구간 해결법과 솔직 후기" },
];

export type 단계상태 = "done" | "skip" | "now" | "upcoming" | "passed";

export interface 단계계획 {
  key: string; 이름: string; 권장일: string; 시작: string; 끝: string;
  키워드: string; 각도: string; 제목예: string;
  상태: 단계상태; postId: number | null;
}

export interface 단계기록 { post_id?: number; at?: string; skip?: boolean }

/** 오늘 기준 D-day (출시일 − 오늘). 출시 당일 0, 전날 1, 다음 날 −1. */
export function 디데이(출시일: string, 오늘: string): number {
  return Math.round(DateTime.fromISO(출시일).diff(DateTime.fromISO(오늘), "days").days);
}

export function 디데이글(n: number): string {
  return n > 0 ? `D-${n}` : n === 0 ? "D-day" : `D+${-n}`;
}

export function 계획짜기(게임: string, 출시일: string, 오늘: string, 기록: Record<string, 단계기록> = {}): 단계계획[] {
  const 출시 = DateTime.fromISO(출시일);
  const 지금 = DateTime.fromISO(오늘);
  const 날 = (n: number) => 출시.plus({ days: n }).toFormat("yyyy-MM-dd");
  return 단계들.map((s) => {
    const 시작 = 출시.plus({ days: s.창[0] }), 끝 = 출시.plus({ days: s.창[1] });
    const 것 = 기록[s.key] ?? {};
    const 상태: 단계상태 = 것.post_id ? "done" : 것.skip ? "skip"
      : 지금 < 시작 ? "upcoming" : 지금 > 끝 ? "passed" : "now";
    return {
      key: s.key, 이름: s.이름, 권장일: 날(s.날), 시작: 날(s.창[0]), 끝: 날(s.창[1]),
      키워드: `${게임} ${s.꼬리}`, 각도: s.각도, 제목예: s.제목예.replace("{게임}", 게임),
      상태, postId: 것.post_id ?? null,
    };
  });
}

/** 지금 할 단계(열려 있고 아직 안 쓴 것) — 없으면 다음에 열릴 단계. */
export function 다음단계(계획: 단계계획[]): { 지금: 단계계획 | null; 다음: 단계계획 | null } {
  return {
    지금: 계획.find((s) => s.상태 === "now") ?? null,
    다음: 계획.find((s) => s.상태 === "upcoming") ?? null,
  };
}
