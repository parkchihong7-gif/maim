/**
 * **오늘 무엇을 몇 편 쓸 것인가.**
 *
 * 예전에는 활성 카테고리를 전부 한 편씩 돌렸다. 카테고리가 아홉이면
 * 매일 아홉 편이 나오는데, 그만큼 올리는 사람은 없다. 쌓이기만 하고
 * Claude 한도와 이미지 한도만 축낸다.
 *
 * 이제 두 가지를 정하신다.
 *
 *   카테고리마다  하루 몇 편 (0~10). 0 이면 오늘은 쉰다
 *   차례          순차 / 랜덤 / 덜 쓴 것 먼저
 *
 * 차례가 왜 필요한가
 *   하루 상한에 걸려 뒤가 잘릴 때, **무엇이 잘리느냐**가 달라진다.
 *   순차면 늘 뒤쪽 카테고리가 잘리고, 덜 쓴 것 먼저면 골고루 돈다.
 */

import { getDb } from "../db/index.js";
import { getSetting, setSetting } from "../db/repositories/settings.js";
import type { Category } from "../db/repositories/categories.js";
import { 지금주인 } from "../tenancy.js";

/** 하루에 만들 수 있는 글의 **최대**. 이보다 높게는 못 올린다. */
export const 하루최대 = 10;

const 상한키 = "daily_cap";

/**
 * 오늘 몇 편까지 만들 것인가. **사장님이 정하신다.**
 *
 * 카테고리별 편수를 다 더한 값과는 다르다. 카테고리를 늘리다 보면 합이
 * 저절로 불어나는데, 정작 하루에 올리실 수 있는 양은 그대로다. 그래서
 * 총수는 따로 못 박아 둔다 — 카테고리를 몇 개를 만드시든 하루에 나오는
 * 글은 여기 적은 만큼이다.
 */
export function 지금상한(): number {
  // **빈 값을 0 으로 읽으면 안 된다.**
  //
  // `Number(null)` 도 `Number("")` 도 0 이고, 0 은 유한한 수라 «숫자가
  // 아니다» 검사를 그냥 통과한다. 그러면 갓 설치한 분의 상한이 0 이 되어
  // 아침에 글이 한 편도 안 나오는데, 화면에는 아무 탈도 안 보인다.
  // **한 번도 안 정하신 것**과 **0 으로 정하신 것**은 다르다.
  const 글 = (getSetting(상한키) ?? "").trim();
  if (글 === "") return 하루최대;
  const 값 = Number(글);
  if (!Number.isFinite(값)) return 하루최대;
  return Math.max(0, Math.min(하루최대, Math.floor(값)));
}

export function 상한정하기(값: number): number {
  const n = Math.max(0, Math.min(하루최대, Math.floor(Number(값))));
  setSetting(상한키, String(n));
  return n;
}

/** 카테고리 하나에 줄 수 있는 최대 편수. */
export const 카테고리상한 = 하루최대;

export type 차례 = "sequential" | "random" | "least_used";

export const 차례이름: Record<차례, string> = {
  sequential: "순차적 — 카테고리 순서대로",
  random: "랜덤 — 매일 무작위로",
  least_used: "덜 쓴 것 먼저 — 오래 쉰 카테고리부터",
};

const 차례키 = "schedule_order";
const 마지막키 = "last_daily_run";
const 시각키 = "daily_time";

/** 아침에 글이 준비되는 시각. `HH:MM`. */
export function 지금시각(): string {
  const 글 = (getSetting(시각키) ?? "").trim();
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(글) ? 글 : "06:00";
}

export function 시각정하기(글: string): string {
  const 값 = (글 ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(값)) {
    throw new Error("시각은 00:00 ~ 23:59 사이여야 합니다.");
  }
  setSetting(시각키, 값);
  return 값;
}

/** 자명종에게 줄 말. `분 시 * * *` 꼴이다. */
export function 크론식(시각: string = 지금시각()): string {
  const [시, 분] = 시각.split(":");
  return `${Number(분)} ${Number(시)} * * *`;
}

/** 매일 작업이 돌았다고 적는다. 화면이 «자명종이 꺼졌다» 를 아는 근거다. */
export function 돌았다고적기(): void {
  setSetting(마지막키, new Date().toISOString());
}

/** 마지막으로 돈 때. 한 번도 안 돌았으면 빈 값. */
export function 마지막으로돈때(): string {
  return getSetting(마지막키) || "";
}

export function 지금차례(): 차례 {
  const 값 = (getSetting(차례키) || "").trim();
  return 값 === "sequential" || 값 === "random" || 값 === "least_used" ? 값 : "least_used";
}

function 섞기<T>(arr: T[]): T[] {
  const 벌 = [...arr];
  for (let i = 벌.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [벌[i],벌[j]] = [벌[j],벌[i]];
  }
  return 벌;
}

/** 이 차례로 늘어놓았을 때 카테고리가 오는 순서. */
export function 줄세우기(방식: 차례 = 지금차례()): Category[] {
  const db = getDb();
  const 주인 = 지금주인();
  const 정렬 = 방식 === "sequential"
    ? "id ASC"
    // **한 번도 안 쓴 것이 맨 앞이다.** `last_used_at` 이 NULL 인 것을
    // 그냥 ASC 로 두면 SQLite 가 NULL 을 제일 작게 봐서 앞에 오긴 하는데,
    // 그 뜻이 코드에 안 드러난다. 명시해 둔다.
    : "last_used_at IS NOT NULL, last_used_at ASC, id ASC";
  const 줄 = db.prepare(
    `SELECT * FROM categories WHERE owner_key = ? AND active = 1 AND daily_count > 0
     ORDER BY ${정렬}`,
  ).all(주인) as Category[];
  return 방식 === "random" ? 섞기(줄) : 줄;
}

export interface 오늘할일 {
  category: Category;
  /** 이 카테고리로 몇 편째인가 (1부터). 안내에만 쓴다. */
  nth: number;
}

/**
 * 오늘 만들 목록을 **순서대로** 펼친다.
 *
 * 한 카테고리가 3편이면 그 카테고리가 세 번 들어간다. 총수가 하루상한을
 * 넘으면 **뒤에서 자른다** — 무엇이 잘리느냐는 위 차례가 정한다.
 *
 * 한 카테고리를 연달아 세 번 쓰지 않고 **돌아가며** 넣는다. 연달아 쓰면
 * 같은 주제 세 편이 잇달아 나와 서로 겹친다.
 */
export function 오늘목록(방식: 차례 = 지금차례()): 오늘할일[] {
  const 상한 = 지금상한();
  const 줄 = 줄세우기(방식);
  if (줄.length === 0) return [];

  const 남은 = 줄.map((c) => Math.max(0, Math.min(카테고리상한, c.daily_count ?? 1)));
  const 센것 = 줄.map(() => 0);
  const 목록: 오늘할일[] = [];

  // 한 바퀴씩 돌며 한 편씩 집는다. 다 떨어진 것은 건너뛴다.
  while (목록.length < 상한 && 남은.some((n) => n > 0)) {
    for (let i = 0; i < 줄.length && 목록.length < 상한; i++) {
      if (남은[i] <= 0) continue;
      남은[i]--;
      센것[i]++;
      목록.push({ category: 줄[i], nth: 센것[i] });
    }
  }
  return 목록;
}

/** 지금 설정대로면 하루에 몇 편이 나오는가. 화면에 보여 준다. */
export function 오늘몇편(방식: 차례 = 지금차례()): { 계획: number; 잘림: number; 상한: number } {
  const 상한 = 지금상한();
  const 줄 = 줄세우기(방식);
  const 합 = 줄.reduce((a, c) => a + Math.max(0, Math.min(카테고리상한, c.daily_count ?? 1)), 0);
  return { 계획: Math.min(합, 상한), 잘림: Math.max(0, 합 - 상한), 상한 };
}

export function 차례정하기(방식: 차례): void {
  setSetting(차례키, 방식);
}
