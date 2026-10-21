/**
 * 🕹️ 판단·사진·막힘이 들어올 때마다 퀘스트·미션 상태를 맞춘다.
 *
 * 집 PC 는 «무엇을 봤는지» 만 보내고, «그래서 퀘스트가 어떻게 됐는지» 는 여기서 정한다.
 * 그래야 집 PC 프로그램이 바뀌어도 대시보드 숫자가 같은 규칙으로 셈해진다.
 */
import {
  에이전트, 상태칸고치기, 퀘스트찾거나만들기, 퀘스트읽기, 퀘스트고치기, 진행표, 기록,
  미션읽기, 미션고치기, 미션목표들, 미션진행, 미션칸고름, 목록줄들, 목록줄고치기, 퀘스트목록, 열린세션,
  type 퀘스트, type 미션,
} from "../db/repositories/gamePlay.js";
import { 빠진것 } from "./미션.js";
import type { 판단결과 } from "./판단.js";

const 지금ISO = () => new Date().toISOString();

/** 지금 진행 중인 퀘스트 (집 PC 상태칸에 적어 둔다). */
export function 지금퀘스트(): 퀘스트 | null {
  const id = Number(에이전트().detail.quest_id);
  return id ? 퀘스트읽기(id) : null;
}

function 지금미션(): 미션 | null {
  const s = 열린세션();
  return s?.mission_id ? 미션읽기(s.mission_id) : null;
}

/** 새 퀘스트를 미션 진행에 붙이고, 미션 체크리스트가 따로 있으면 그것을 퀘스트에 옮긴다. */
function 미션에붙이기(q: 퀘스트): void {
  const m = 지금미션();
  if (!m) return;
  const 진행 = 미션진행(m);
  if (!진행.quest_ids.includes(q.id)) 진행.quest_ids.push(q.id);
  미션고치기(m.id, { status: "진행중", progress: 진행 });
  const 칸 = 미션칸고름(m);
  if (칸 && !q.checklist_json) 퀘스트고치기(q.id, { checklist_json: JSON.stringify(칸) });
  // 게임 미션 목록에 같은 이름이 있으면 이어 붙인다(15-6).
  const 줄 = 목록줄들(q.game_id).find((r) => r.name === q.name);
  if (줄 && !줄.quest_id) 목록줄고치기(줄.id, { questId: q.id, status: "진행중" });
}

/** 판단 결과를 반영한다. 돌려주는 것: 지금 퀘스트와 빠진 장면 (집 PC 가 노릴 것). */
export function 판단반영(gameId: string, 답: 판단결과): { quest: 퀘스트 | null; 빠진장면: string[] } {
  let q = 지금퀘스트();
  if (답.퀘스트 && (!q || q.name !== 답.퀘스트.이름 || q.game_id !== gameId)) {
    const { 퀘스트: 찾은것, 새것 } = 퀘스트찾거나만들기(gameId, 답.퀘스트.이름, 답.퀘스트.종류);
    q = 찾은것;
    상태칸고치기({ quest_id: q.id, quest_name: q.name });
    if (새것) 기록("퀘스트받음", { quest_id: q.id, 이름: q.name, 종류: q.kind }, gameId);
    if (q.status === "진행중") 미션에붙이기(q);
  }
  if (q && (답.장면 === "퀘스트완료" || (답.장면 === "보상" && 답.퀘스트?.단계?.includes("완료"))) && q.status === "진행중") {
    퀘스트고치기(q.id, { status: "완료", done_at: 지금ISO() });
    const 표 = 진행표(q);
    기록("퀘스트완료", { quest_id: q.id, 이름: q.name, 찬: 표.찬, 전체: 표.전체, 부족: 빠진것(표.칸) }, gameId);
    q = 퀘스트읽기(q.id);
    미션확인();
  }
  if (q && 답.행동 === "직접플레이대기") 막힘반영(q.id, 답.이유 || "AI 가 직접 플레이가 필요하다고 판단", gameId);
  if (답.막음) 기록("안전", { 행동: 답.행동, 까닭: 답.막음, 장면: 답.장면 }, gameId);
  return { quest: q, 빠진장면: q ? 빠진것(진행표(q).칸) : [] };
}

/** 사진이 들어온 뒤 — 마지막 사진, 체크리스트 다 참 알림. */
export function 사진반영(shotId: number, questId: number | null, 장면: string, gameId: string): void {
  if (!questId) return;
  const q = 퀘스트읽기(questId);
  if (!q) return;
  const 전에 = 진행표(q);
  퀘스트고치기(q.id, { last_shot_id: shotId });
  const 뒤 = 진행표(q);
  기록("사진", { shot_id: shotId, quest_id: q.id, 장면, 찬: 뒤.찬, 전체: 뒤.전체 }, gameId);
  if (!전에.다참 && 뒤.다참) {
    기록("체크리스트다참", { quest_id: q.id, 이름: q.name }, gameId);
    미션확인();
  }
}

/** 막힌 퀘스트 → 직접 플레이 대기 (GAME_PLAN 6번). */
export function 막힘반영(questId: number, 이유: string, gameId: string): void {
  const q = 퀘스트읽기(questId);
  if (!q || q.status !== "진행중") return;
  퀘스트고치기(q.id, { status: "직접플레이대기", stuck_reason: 이유.slice(0, 120) });
  기록("직접플레이대기", { quest_id: q.id, 이름: q.name, 이유 }, gameId);
  상태칸고치기({ quest_id: null, quest_name: null });
}

/** 사람이 직접 끝낸 뒤 [완료로 표시]. */
export function 사람이완료(questId: number): 퀘스트 | null {
  const q = 퀘스트읽기(questId);
  if (!q) return null;
  if (q.status !== "글완료") 퀘스트고치기(q.id, { status: "완료", done_at: q.done_at ?? 지금ISO(), stuck_reason: null });
  기록("사람이완료", { quest_id: q.id, 이름: q.name }, q.game_id);
  미션확인();
  return 퀘스트읽기(q.id);
}

export interface 미션요약 {
  id: number; title: string; status: string;
  목표수: number; 완료수: number; 다채움: boolean;
  노릴퀘스트: string[];   // 목록 순서·이름으로 정한 목표 (집 PC·화면 표시용)
  퀘스트들: { id: number; name: string; status: string; 찬: number; 전체: number }[];
}

/** 미션 목표 개수와 «노릴 퀘스트 이름» 을 셈한다. */
export function 미션요약하기(m: 미션): 미션요약 {
  const 목표들 = 미션목표들(m);
  const 목표수 = 목표들.reduce((합, t) => 합 + (t.퀘스트 ? 1 : Math.max(1, Number(t.개수) || 1)), 0);
  const 진행 = 미션진행(m);
  const 퀘스트들 = 진행.quest_ids.map((id) => 퀘스트읽기(id)).filter((q): q is 퀘스트 => !!q).map((q) => {
    const 표 = 진행표(q);
    return { id: q.id, name: q.name, status: q.status, 찬: 표.찬, 전체: 표.전체 };
  });
  const 끝난것 = 퀘스트들.filter((q) => q.status === "완료" || q.status === "글완료");
  const 줄들 = 목록줄들(m.game_id).filter((r) => r.status === "진행중" || r.status === "진행가능");
  const 노릴: string[] = [];
  for (const t of 목표들) {
    if (t.퀘스트) 노릴.push(t.퀘스트);
    else if (t.종류 === "목록순서") 노릴.push(...줄들.slice(0, Math.max(1, Number(t.개수) || 1)).map((r) => r.name));
    else 노릴.push(...줄들.filter((r) => r.kind === t.종류).slice(0, Math.max(1, Number(t.개수) || 1)).map((r) => r.name));
  }
  return {
    id: m.id, title: m.title, status: m.status, 목표수, 완료수: 끝난것.length, 다채움: 끝난것.length >= 목표수,
    노릴퀘스트: [...new Set(노릴)], 퀘스트들,
  };
}

/**
 * 미션 상태 맞추기. 목표를 다 채우면 집 PC 를 멈추고,
 * 그 퀘스트들의 사진 체크리스트까지 다 찼으면 «준비됨».
 */
export function 미션확인(): 미션요약 | null {
  const m = 지금미션();
  if (!m) return null;
  const 요약 = 미션요약하기(m);
  if (요약.다채움) {
    const 다참 = 요약.퀘스트들.filter((q) => q.status === "완료" || q.status === "글완료").every((q) => q.찬 >= q.전체);
    미션고치기(m.id, { status: 다참 ? "준비됨" : "진행중" });
    if (m.status !== "준비됨") 기록("미션목표다채움", { mission_id: m.id, 사진다참: 다참 }, m.game_id);
  }
  return 요약;
}

/** 퀘스트 목록 화면 숫자 — 글 쓸 준비(완료 + 체크리스트 다 참). */
export function 글준비수(gameId: string): number {
  return 퀘스트목록(gameId, "완료").filter((q) => 진행표(q).다참).length;
}
