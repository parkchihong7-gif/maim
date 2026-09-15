import crypto from "node:crypto";
import { getDb } from "../index.js";

export interface AccessCode {
  id: number;
  code: string;
  session_token: string | null;
  redeemed_at: string | null;
  created_at: string;
}

const CODE_COUNT = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

function generateCode(length = 10): string {
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/** 테이블이 비어 있을 때만 코드 10개를 새로 채운다(이미 있으면 아무것도 안 함). */
export function seedAccessCodesIfEmpty(): void {
  const db = getDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM access_codes").get() as { count: number };
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO access_codes (code) VALUES (?)");
  const insertMany = db.transaction((codes: string[]) => {
    for (const code of codes) insert.run(code);
  });
  const codes = new Set<string>();
  while (codes.size < CODE_COUNT) codes.add(generateCode());
  insertMany([...codes]);
}

export function listAccessCodes(): AccessCode[] {
  seedAccessCodesIfEmpty();
  return getDb().prepare("SELECT * FROM access_codes ORDER BY id ASC").all() as AccessCode[];
}

/**
 * 코드를 1회성으로 사용 처리한다. "아직 redeemed_at이 비어있을 때만" 성공하는
 * 단일 원자적 UPDATE라서, 동시에 여러 명이 같은 코드로 시도해도 SQLite의 단일
 * 쓰기 스레드 특성상 정확히 한 번만 성공하고 나머지는 실패한다(레이스 컨디션 없음).
 * 성공 시 새로 발급한 긴 세션 토큰을 돌려주고, 이후 인증은 이 값으로만 이뤄진다.
 */
export function redeemAccessCode(code: string): string | null {
  const sessionToken = crypto.randomBytes(24).toString("hex");
  const result = getDb()
    .prepare(
      "UPDATE access_codes SET redeemed_at = datetime('now'), session_token = ? WHERE code = ? AND redeemed_at IS NULL",
    )
    .run(sessionToken, code);
  return result.changes > 0 ? sessionToken : null;
}

export function isValidGuestSessionToken(token: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM access_codes WHERE session_token = ? AND redeemed_at IS NOT NULL")
    .get(token);
  return !!row;
}

/** 발급된 코드/세션을 전부 폐기하고 새 10개를 재발급한다. */
export function resetAccessCodes(): AccessCode[] {
  const db = getDb();
  db.prepare("DELETE FROM access_codes").run();
  seedAccessCodesIfEmpty();
  return listAccessCodes();
}
