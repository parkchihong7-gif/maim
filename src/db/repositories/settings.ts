import crypto from "node:crypto";
import { getDb } from "../index.js";
import { config } from "../../config.js";
import { POSTING_DIRECTION_PRESETS } from "../../claude/blogProfile.js";
import { 지금, 체험역할 } from "../../tenancy.js";

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

/**
 * 넣어 둔 무료 이미지 키. **하나도 없으면 글쓰기를 막는다.**
 *
 * 키가 없어도 글은 나온다. 그런데 사진 없는 초안이 쌓이고, 체험 회원은
 * «이미지 첨부에 실패했습니다» 창만 보게 된다. 셋 다 무료이고 가입하면
 * 바로 나오니, 적어도 하나는 넣은 뒤 쓰시게 한다.
 */
export function 이미지키들(): { count: number; total: number; set: string[]; missing: string[] } {
  const 목록: [string, string | null][] = [
    ["Unsplash", getUnsplashKey()], ["Pexels", getPexelsKey()], ["Pixabay", getPixabayKey()],
  ];
  const set = 목록.filter(([, 키]) => !!키).map(([이름]) => 이름);
  const missing = 목록.filter(([, 키]) => !키).map(([이름]) => 이름);
  return { count: set.length, total: 목록.length, set, missing };
}

/**
 * **본문 최소 글자수.**
 *
 * 예전에는 2,000자로 코드에 박혀 있었다. 그런데 목표 길이는 2,500~4,500
 * 사이 무작위여서, 2,100자짜리 글이 「기준은 넘었다」 며 그냥 통과했다.
 * 그래서 어떤 날은 2,000자 초반, 어떤 날은 3,000자가 나왔다.
 *
 * 이제 사장님이 정하신다. 기준을 3,000으로 두시면 **3,000자가 안 되는 글은
 * 한 번 더 쓰게 한다.**
 */
const 최소분량키 = "min_length";
export const 최소분량기본 = 3000;
export const 최소분량최저 = 800;
export const 최소분량최고 = 6000;

export function 최소분량(): number {
  // 체험 자리는 자기 값이 있으면 그것을, 없으면 주인의 값을 따른다.
  // 글자수는 스타일이라기보다 «얼마나 길게» 라서, 안 정한 분에게 주인
  // 기준을 그대로 주는 편이 자연스럽다.
  const 글 = ((체험자리() ? 자리값(최소분량키) : null) ?? getSetting(최소분량키) ?? "").trim();
  if (글 === "") return 최소분량기본;
  const 값 = Number(글);
  if (!Number.isFinite(값)) return 최소분량기본;
  return Math.max(최소분량최저, Math.min(최소분량최고, Math.floor(값)));
}

export function 최소분량정하기(값: number): number {
  const n = Math.max(최소분량최저, Math.min(최소분량최고, Math.floor(Number(값))));
  개인설정정하기(최소분량키, String(n));
  return n;
}

/**
 * **자리마다 따로 두는 «글 스타일» 설정.**
 *
 * 체험 키를 여러 분께 나눠 드리면, 전에는 모두가 사장님의 블로그 유형·주제·
 * 말투로 글을 받았다. 설정 표(settings)에 «누구 것» 칸이 없었기 때문이다.
 * 그렇다고 체험 회원이 그 표를 고치게 하면 사장님 아침 글의 말투가 바뀐다.
 *
 * 그래서 이 다섯 가지만 자리마다 따로 둔다.
 *
 *   주인(owner_key='')  → 지금처럼 settings 표
 *   체험(owner_key=1차키) → seat_settings 표, 자기 줄만
 *
 * 체험 회원이 아직 안 정했으면 **주인의 스타일을 빌려 쓰지 않는다**(글자수만
 * 예외 — 위 최소분량() 참고). 사장님 블로그 주제로 쓴 글이 친구에게 가면
 * 그 친구는 «내 블로그에 맞나» 를 판단할 수 없다. 안 정한 칸은 기본값이다.
 *
 * AI 연결·이미지 키·아침 예약·사용자 프리셋 목록은 여기 없다. 그건 서버
 * 주인의 것이고, 체험 회원은 여전히 못 바꾼다.
 */
export const 개인설정키 = [
  "blog_type",
  "blog_topic",
  "posting_direction_preset",
  "posting_direction_refinement",
  최소분량키,
] as const;

export function 개인설정인가(key: string): boolean {
  return (개인설정키 as readonly string[]).includes(key);
}

/** 보강 지시 한 칸에 담을 수 있는 최대 글자수. 체험 키가 서버를 부풀리지 못하게. */
export const 개인설정_최대글자 = 2000;

/** 체험으로 들어온 자리인가. 1차키가 비어 있으면 주인으로 본다(안전한 쪽). */
function 체험자리(): boolean {
  const 누구 = 지금();
  return 누구.role === 체험역할 && 누구.ownerKey !== "";
}

function 자리값(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM seat_settings WHERE owner_key = ? AND key = ?")
    .get(지금().ownerKey, key) as { value: string } | undefined;
  return row ? row.value : null;
}

/** 지금 자리의 스타일 설정 한 칸. 주인은 settings, 체험은 제 줄. */
export function 개인설정(key: string): string | null {
  if (!개인설정인가(key)) throw new Error(`${key} 는 자리별 설정이 아닙니다.`);
  return 체험자리() ? 자리값(key) : getSetting(key);
}

export function 개인설정들(keys: readonly string[]): Record<string, string | null> {
  const 결과: Record<string, string | null> = {};
  for (const key of keys) 결과[key] = 개인설정(key);
  return 결과;
}

/** 지금 자리의 스타일 설정을 바꾼다. 빈 값·null 은 «안 정함» 으로 되돌린다. */
export function 개인설정정하기(key: string, value: string | null): void {
  if (!개인설정인가(key)) throw new Error(`${key} 는 자리별 설정이 아닙니다.`);
  if (!체험자리()) { setSetting(key, value); return; }
  const db = getDb();
  const 주인키 = 지금().ownerKey;
  if (value === null || value === "") {
    db.prepare("DELETE FROM seat_settings WHERE owner_key = ? AND key = ?").run(주인키, key);
    return;
  }
  db.prepare(
    `INSERT INTO seat_settings (owner_key, key, value, updated_at) VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(owner_key, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(주인키, key, value);
}
