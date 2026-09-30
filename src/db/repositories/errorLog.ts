/**
 * **글 만들기에서 난 오류를 남겨 두는 곳.**
 *
 * 체험 회원이 «오류가 떴다» 고만 말하면 서버 주인은 무엇이 문제인지 알 길이
 * 없다. 알림창의 글은 휴대폰에서 복사도 안 된다. 그래서 오류마다 누구의
 * 자리에서, 어느 카테고리에서, 무엇이 났는지를 적어 두고 주인 화면에서
 * 보여 준다.
 *
 * 끝없이 쌓이지 않게 최근 것만 남긴다.
 */
import { getDb } from "../index.js";
import { 지금 } from "../../tenancy.js";

/** 남겨 둘 줄 수. 넘으면 오래된 것부터 지운다. */
export const 오류_남길수 = 200;

export interface 오류줄 {
  id: number;
  owner_key: string;
  role: string;
  stage: string;
  category: string;
  message: string;
  created_at: string;
  /** 체험 회원이면 그분 이름 (접속할 때 받은 것). 주인 화면에서만 채운다. */
  holder_name?: string | null;
}

/** 지금 자리에서 난 오류를 적는다. 적다가 탈이 나도 본래 오류를 가리지 않는다. */
export function 오류적기(stage: string, category: string, message: string): void {
  try {
    const 누구 = 지금();
    const db = getDb();
    db.prepare(
      "INSERT INTO error_log (owner_key, role, stage, category, message) VALUES (?, ?, ?, ?, ?)",
    ).run(누구.ownerKey, 누구.role, stage, category, String(message).slice(0, 4000));
    db.prepare(
      "DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?",
    ).run(오류_남길수);
  } catch (탈) {
    console.error("[error_log] 적지 못했습니다:", (탈 as Error).message);
  }
}

/**
 * 최근 오류. **주인은 전부**, 체험 회원은 **자기 것만** 본다.
 * 남의 카테고리 이름이 체험 회원에게 보이면 안 된다.
 */
export function 최근오류(모두: boolean, 몇개 = 30): 오류줄[] {
  const db = getDb();
  if (모두) {
    return db.prepare(
      `SELECT e.*, (SELECT s.holder_name FROM keyserver_sessions s
                     WHERE s.key1 = e.owner_key AND e.owner_key <> '' LIMIT 1) AS holder_name
         FROM error_log e ORDER BY e.id DESC LIMIT ?`,
    ).all(몇개) as 오류줄[];
  }
  return db.prepare("SELECT * FROM error_log WHERE owner_key = ? ORDER BY id DESC LIMIT ?")
    .all(지금().ownerKey, 몇개) as 오류줄[];
}
