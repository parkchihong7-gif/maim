import crypto from "node:crypto";
import { getDb } from "../index.js";
import { config } from "../../config.js";
import { POSTING_DIRECTION_PRESETS } from "../../claude/blogProfile.js";

export interface PostingDirectionPreset {
  id: string;
  label: string;
  description: string;
  instruction: string;
  custom: boolean;
}

const CUSTOM_PRESETS_KEY = "custom_presets_json";

function readCustomPresets(): PostingDirectionPreset[] {
  const raw = getSetting(CUSTOM_PRESETS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCustomPresets(presets: PostingDirectionPreset[]): void {
  setSetting(CUSTOM_PRESETS_KEY, JSON.stringify(presets));
}

/** 내장 6종 + 사용자가 직접 추가한 커스텀 프리셋을 합쳐서 돌려준다. */
export function getAllPostingDirectionPresets(): PostingDirectionPreset[] {
  const builtIn: PostingDirectionPreset[] = Object.entries(POSTING_DIRECTION_PRESETS).map(([id, p]) => ({
    id,
    ...p,
    custom: false,
  }));
  return [...builtIn, ...readCustomPresets()];
}

export function addCustomPreset(input: { label: string; description: string; instruction: string }): PostingDirectionPreset {
  const presets = readCustomPresets();
  const preset: PostingDirectionPreset = {
    id: `custom_${crypto.randomBytes(4).toString("hex")}`,
    label: input.label,
    description: input.description,
    instruction: input.instruction,
    custom: true,
  };
  presets.push(preset);
  writeCustomPresets(presets);
  return preset;
}

/** custom_ 접두사가 붙은 id만 지울 수 있다(내장 프리셋은 코드에 있으므로 삭제 대상이 아님). */
export function deleteCustomPreset(id: string): void {
  if (!id.startsWith("custom_")) return;
  const presets = readCustomPresets().filter((p) => p.id !== id);
  writeCustomPresets(presets);
}

/** 저장된 프리셋 id(내장이든 커스텀이든)로 실제 AI 지시문 텍스트를 찾는다. */
export function resolvePostingDirectionInstruction(presetId: string | null): string | null {
  if (!presetId) return null;
  const found = getAllPostingDirectionPresets().find((p) => p.id === presetId);
  return found?.instruction || null;
}

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

export function getPixabayKey(): string | null {
  return getSetting("pixabay_api_key") || config.pixabayApiKey || null;
}
