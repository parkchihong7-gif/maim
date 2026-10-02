/**
 * 지금 자리의 «쓰는 스타일» — 🎨 내 블로그 분석에서 승인하고 고른 버전.
 * 글쓰기는 [적용] 이 체크돼 있을 때만 이것을 넣는다. 무엇이 잘못돼도 null(= 예전처럼).
 */
import { 개인설정 } from "../db/repositories/settings.js";
import { 버전읽기 } from "../db/repositories/blogStyle.js";
import { 분석다듬기, 승인스타일블록, type 분석결과 } from "../claude/스타일분석.js";

export function 쓰는스타일(): { id: number; ver: number; at: string; 분석: 분석결과 } | null {
  try {
    const id = Number(개인설정("style_active_id"));
    if (!id) return null;
    const v = 버전읽기(id);
    if (!v || !v.approved_at) return null;
    return { id: v.id, ver: v.ver, at: v.approved_at, 분석: 분석다듬기(JSON.parse(v.analysis_json)) };
  } catch {
    return null;
  }
}

export function 스타일적용중(): boolean {
  try { return 개인설정("style_apply") === "1"; } catch { return false; }
}

/** 글쓰기 지시문에 넣을 블록. 적용 안 함·승인 버전 없음이면 null. */
export function 적용할스타일블록(): { 블록: string; ver: number } | null {
  if (!스타일적용중()) return null;
  const s = 쓰는스타일();
  if (!s) return null;
  const 블록 = 승인스타일블록(s.분석.style);
  return 블록 ? { 블록, ver: s.ver } : null;
}
