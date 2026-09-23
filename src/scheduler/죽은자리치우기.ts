/**
 * **기간이 끝났거나 끊긴 체험 키의 자리를 치운다.**
 *
 * 왜 여기서 하나
 *   체험 회원이 마지막으로 나간 뒤로는 아무도 이 서버를 두드리지 않는다.
 *   화면이 1분마다 묻는 heartbeat 는 브라우저가 열려 있을 때만 돈다.
 *   그래서 기간이 끝난 자리는 **아무도 모르게 계속 남는다.**
 *   매일 한 번 도는 작업에 얹어 두면 늦어도 하루 안에 치워진다.
 *
 * 무엇을 죽은 것으로 보나
 *   키 서버가 이 셋 중 하나로 답할 때만 지운다.
 *
 *     not_found   장부에서 사라졌다
 *     suspended   주인이 끊었다
 *     expired     기간이 끝났다
 *
 *   `session_replaced` 는 **살아 있는 키**다. 그 사람이 다른 기기로 옮겨
 *   갔다는 뜻일 뿐이다. 이걸 죽은 것으로 세면 휴대폰으로 갈아탄 사람의
 *   글이 통째로 날아간다.
 *
 *   키 서버에 닿지 못했을 때도 지우지 않는다. 인터넷이 끊긴 것을 "기간이
 *   끝났다" 로 읽으면 멀쩡한 자리가 사라진다. **의심스러우면 놔둔다.**
 */

import { getDb } from "../db/index.js";
import { purgeTenant } from "../db/repositories/tenants.js";
import { checkSession, keyserverEnabled } from "../keyserver.js";

/** 이 답이 오면 그 키는 죽은 것이다. */
const 죽은답 = new Set(["not_found", "suspended", "expired"]);

export async function 죽은자리치우기(): Promise<void> {
  if (!keyserverEnabled()) return;

  const db = getDb();
  const 자리들 = db.prepare(
    "SELECT DISTINCT key1 FROM keyserver_sessions WHERE key1 <> ''",
  ).all() as { key1: string }[];
  if (자리들.length === 0) return;

  for (const { key1 } of 자리들) {
    const 기기들 = db.prepare(
      "SELECT key2, remote_token FROM keyserver_sessions WHERE key1 = ?",
    ).all(key1) as { key2: string; remote_token: string }[];

    // 기기를 **전부** 물어본다. 하나라도 살아 있다는 답이 오면 그 사람은
    // 아직 쓸 수 있는 사람이다.
    let 죽었나 = false;
    for (const 기기 of 기기들) {
      const 답 = await checkSession(기기.key2, 기기.remote_token);
      if (답.ok) { 죽었나 = false; break; }
      const 까닭 = (답 as { reason?: string }).reason || "";
      if (죽은답.has(까닭)) { 죽었나 = true; continue; }
      // session_replaced · unreachable · 그 밖의 모르는 답 → 살아 있다고 본다
      죽었나 = false;
      break;
    }

    if (!죽었나) continue;

    try {
      const 결과 = purgeTenant(key1);
      console.log(`[치우기] ${key1} 의 자리를 지웠습니다 — 글 ${결과.posts}편, `
                + `카테고리 ${결과.categories}개, 이미지 ${결과.files}묶음`);
    } catch (탈) {
      console.error(`[치우기] ${key1} 을 지우지 못했습니다:`, (탈 as Error).message);
    }
  }
}
