/**
 * 통합 관리자 대시보드 접속키로 들어온 사람의 **세션**.
 *
 * 키 자체는 여기에 없다. 키 장부는 앱스 스크립트(구글 시트)가 들고 있고,
 * 여기는 "이 브라우저는 아까 통과했다" 만 기억한다.
 *
 * 왜 요청마다 키 서버에 안 묻나
 *   앱스 스크립트는 한 번 부르는 데 1~2초가 걸린다. 화면이 API 를 여러 번
 *   부르는데 그때마다 물으면 못 쓴다. 들어올 때 한 번 묻고, 그 뒤엔 여기
 *   적힌 것으로 본다. 대신 화면이 1분마다 다시 물어서(heartbeat), 키가
 *   정지되거나 다른 기기가 같은 2차키로 들어오면 그때 끊는다.
 */

import crypto from "node:crypto";
import { getDb } from "../index.js";

export interface KeyserverSession {
  token: string;
  key2: string;
  remote_token: string;
  holder_name: string;
  role: string;
  device_label: string;
}

/**
 * 통과한 사람에게 이 서버의 세션값을 내어 준다.
 *
 * 같은 2차키로 **다시** 들어오면 앞의 것을 지운다. 키 서버도 그렇게
 * 움직인다(기기당 한 세션). 여기만 남겨 두면 끊겼어야 할 브라우저가
 * 계속 돌아다닌다.
 */
export function openSession(input: {
  key2: string;
  remoteToken: string;
  holderName?: string;
  role?: string;
  deviceLabel?: string;
}): string {
  const db = getDb();
  const token = crypto.randomBytes(24).toString("hex");
  const 열기 = db.transaction(() => {
    db.prepare("DELETE FROM keyserver_sessions WHERE key2 = ?").run(input.key2);
    db.prepare(
      `INSERT INTO keyserver_sessions
         (token, key2, remote_token, holder_name, role, device_label)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(token, input.key2, input.remoteToken,
          input.holderName ?? "", input.role ?? "client", input.deviceLabel ?? "");
  });
  열기();
  return token;
}

export function findSession(token: string): KeyserverSession | null {
  if (!token) return null;
  const row = getDb()
    .prepare("SELECT * FROM keyserver_sessions WHERE token = ?")
    .get(token) as KeyserverSession | undefined;
  return row ?? null;
}

export function isValidGuestSessionToken(token: string): boolean {
  return !!findSession(token);
}

export function closeSession(token: string): void {
  getDb().prepare("DELETE FROM keyserver_sessions WHERE token = ?").run(token);
}

/** 1분마다 확인한 시각을 적어 둔다. 언제부터 조용한지 보려는 것. */
export function touchSession(token: string): void {
  getDb()
    .prepare("UPDATE keyserver_sessions SET checked_at = datetime('now') WHERE token = ?")
    .run(token);
}
