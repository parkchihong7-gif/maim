import crypto from "node:crypto";
import { getDb } from "../index.js";

export interface AccessCode {
  id: number;
  code: string;
  session_token: string | null;
  redeemed_at: string | null;
  created_at: string;
  tier: 1 | 2;
  parent_id: number | null;
  device_label: "pc" | "laptop" | "mobile" | null;
}

export interface AccessCodeTreeNode {
  code: string;
  redeemed: boolean;
  redeemed_at: string | null;
  deviceCodes: {
    code: string;
    device_label: string;
    redeemed: boolean;
    redeemed_at: string | null;
  }[];
}

export type RedeemResult =
  | { kind: "tier1"; deviceCodes: { code: string; device_label: string }[] }
  | { kind: "tier2"; sessionToken: string };

const TIER1_CODE_COUNT = 10;
const DEVICE_LABELS: AccessCode["device_label"][] = ["pc", "laptop", "mobile"];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 헷갈리는 0/O, 1/I 제외

function generateCode(length = 10): string {
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

/** 테이블이 완전히 비어 있을 때만 1차(tier=1) 코드 10개를 새로 채운다. */
export function seedAccessCodesIfEmpty(): void {
  const db = getDb();
  const { count } = db.prepare("SELECT COUNT(*) as count FROM access_codes").get() as { count: number };
  if (count > 0) return;
  const insert = db.prepare("INSERT INTO access_codes (code, tier) VALUES (?, 1)");
  const insertMany = db.transaction((codes: string[]) => {
    for (const code of codes) insert.run(code);
  });
  const codes = new Set<string>();
  while (codes.size < TIER1_CODE_COUNT) codes.add(generateCode());
  insertMany([...codes]);
}

/** 1차 코드 하나가 등록되는 순간, 그 게스트 전용 기기별(PC/노트북/휴대폰) 2차 코드 3개를 만든다. */
function mintDeviceCodes(parentId: number): { code: string; device_label: string }[] {
  const db = getDb();
  const insert = db.prepare(
    "INSERT INTO access_codes (code, tier, parent_id, device_label) VALUES (?, 2, ?, ?)",
  );
  const codes: { code: string; device_label: string }[] = [];
  const insertAll = db.transaction(() => {
    for (const label of DEVICE_LABELS) {
      const code = generateCode();
      insert.run(code, parentId, label);
      codes.push({ code, device_label: label as string });
    }
  });
  insertAll();
  return codes;
}

export function listAccessCodeTree(): AccessCodeTreeNode[] {
  seedAccessCodesIfEmpty();
  const db = getDb();
  const tier1 = db.prepare("SELECT * FROM access_codes WHERE tier = 1 ORDER BY id ASC").all() as AccessCode[];
  const tier2 = db.prepare("SELECT * FROM access_codes WHERE tier = 2 ORDER BY id ASC").all() as AccessCode[];
  return tier1.map((row) => ({
    code: row.code,
    redeemed: !!row.redeemed_at,
    redeemed_at: row.redeemed_at,
    deviceCodes: tier2
      .filter((d) => d.parent_id === row.id)
      .map((d) => ({
        code: d.code,
        device_label: d.device_label as string,
        redeemed: !!d.redeemed_at,
        redeemed_at: d.redeemed_at,
      })),
  }));
}

/**
 * 코드를 1회성으로 사용 처리한다. "아직 redeemed_at이 비어있을 때만" 성공하는
 * 단일 원자적 UPDATE라서, 동시에 여러 명이 같은 코드로 시도해도 SQLite의 단일
 * 쓰기 스레드 특성상 정확히 한 번만 성공하고 나머지는 실패한다(레이스 컨디션 없음).
 *
 * 1차(tier=1) 코드가 성공하면 그 자리에서 세션을 주지 않고, 대신 기기별
 * 2차 코드 3개를 새로 발급해 돌려준다 — 실제 로그인은 2차 코드로만 이뤄진다.
 * 2차(tier=2) 코드가 성공하면 기존과 동일하게 세션 토큰을 발급해 돌려준다.
 */
export function redeemAccessCode(code: string): RedeemResult | null {
  const db = getDb();
  const result = db
    .prepare("UPDATE access_codes SET redeemed_at = datetime('now') WHERE code = ? AND redeemed_at IS NULL")
    .run(code);
  if (result.changes === 0) return null;

  const row = db.prepare("SELECT * FROM access_codes WHERE code = ?").get(code) as AccessCode;
  if (row.tier === 1) {
    const deviceCodes = mintDeviceCodes(row.id);
    return { kind: "tier1", deviceCodes };
  }

  const sessionToken = crypto.randomBytes(24).toString("hex");
  db.prepare("UPDATE access_codes SET session_token = ? WHERE id = ?").run(sessionToken, row.id);
  return { kind: "tier2", sessionToken };
}

export function isValidGuestSessionToken(token: string): boolean {
  const row = getDb()
    .prepare("SELECT id FROM access_codes WHERE session_token = ? AND redeemed_at IS NOT NULL")
    .get(token);
  return !!row;
}

/** 발급된 코드/세션을 전부(1차+2차) 폐기하고 새 1차 코드 10개를 재발급한다. */
export function resetAccessCodes(): AccessCodeTreeNode[] {
  const db = getDb();
  db.prepare("DELETE FROM access_codes").run();
  seedAccessCodesIfEmpty();
  return listAccessCodeTree();
}
