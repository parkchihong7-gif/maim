import { getDb } from "../index.js";
import { config } from "../../config.js";

/** 001_init.sql에서 만들어졌지만 지금까지 아무도 안 쓰던 key-value 테이블을 재활용한다. */
export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/** value가 null/빈 문자열이면 해당 키를 삭제한다(→ 코드 쪽 기본값/환경변수 폴백으로 복귀). */
export function setSetting(key: string, value: string | null): void {
  if (!value) {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

export function getSettings(keys: string[]): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const key of keys) result[key] = getSetting(key);
  return result;
}

/** 대시보드에서 저장한 키가 있으면 그걸 우선 쓰고, 없으면 배포 시 넣어둔 환경변수로 폴백한다. */
export function getUnsplashKey(): string | null {
  return getSetting("unsplash_access_key") || config.unsplashAccessKey || null;
}

export function getPexelsKey(): string | null {
  return getSetting("pexels_api_key") || config.pexelsApiKey || null;
}
