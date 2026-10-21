/**
 * 🕹️ 게임 사진 자동 정리 — 매일 새벽 4시 (GAME_PLAN 7-5·15-8).
 *
 *   - 이 스샷을 쓴 **모든** 글이 발행 완료 후 N일(기본 30) 지남 → 저장통에서 지우고 deleted_at
 *   - 어떤 글에도 안 쓴 스샷은 찍은 지 M일(기본 60) 지나면
 * 아직 발행 안 한 글이 하나라도 쓰면 남긴다. 집 PC 원본은 집 PC 가 따로 정리한다(원본보관일).
 */
import cron from "node-cron";
import { config } from "../config.js";
import { 게임설정읽기, 지울사진들, 사진지움표시 } from "../db/repositories/gamePlay.js";
import { 사진지우기, 지금저장통 } from "../game/사진저장.js";

export async function 게임사진치우기(지금 = new Date()): Promise<{ 사진: number }> {
  if (!지금저장통()) return { 사진: 0 };
  const 설정 = 게임설정읽기();
  const 지울것 = 지울사진들(설정.서버사진보관일, 설정.안쓴사진보관일, 지금);
  for (const s of 지울것) {
    await 사진지우기(s.gcs_path);
    사진지움표시(s.id);
  }
  if (지울것.length) console.log(`[게임사진치우기] 스샷 ${지울것.length}장 정리`);
  return { 사진: 지울것.length };
}

export function 게임사진치우기걸기(): void {
  cron.schedule("0 4 * * *", () => {
    게임사진치우기().catch((err) => console.error("[게임사진치우기] 실패:", err));
  }, { timezone: config.timezone });
}
