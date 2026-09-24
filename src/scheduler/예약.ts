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
 * 안 정하셨을 때의 하루 편수.
 *
 * 예전엔 최대치(10)였다. 그런데 글 한 편에 3분쯤 걸리고 Cloud Scheduler
 * 가 기다려 주는 시간은 30분이라, 10편이면 **시간을 넘겨 실패한다.**
 * 그리고 하루 열 편을 올리실 분도 없다. 셋이면 충분하고 안전하다.
 */
export const 기본상한 = 3;

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
  if (글 === "") return 기본상한;
  const 값 = Number(글);
  if (!Number.isFinite(값)) return 기본상한;
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

/**
 * **아침에 글이 준비되는 시각. 06:00 고정이다.**
 *
 * 예전에는 화면에서 시각을 바꿀 수 있었다. 그런데 잠들었다 깨는 판에서는
 * 시각이 **두 군데**에 있다 — 프로그램 안과, 밖에서 깨워 주는 Cloud
 * Scheduler. 뒤쪽은 프로그램이 손댈 수 없어서, 바꿀 때마다 사람이 명령
 * 한 줄을 검은 창에 붙여넣어야 했다.
 *
 * 그 한 줄이 늘 문제였다. 지역이 안 맞거나, 이름이 틀리거나, 붙여넣다
 * 깨지거나 한다. 그러면 화면에는 «08:30» 이라고 적혀 있는데 실제로는
 * 아무 일도 안 일어나는, **제일 알아차리기 어려운 고장**이 된다. 실제로
 * 그래서 아침에 글이 하나도 안 나온 적이 있다.
 *
 * 그래서 시각은 못 박는다. 바꿀 수 없으면 어긋날 수도 없다. Cloud
 * Scheduler 는 설치할 때 한 번 걸어 두고 **다시는 건드리지 않는다.**
 *
 * **하루 몇 편**은 화면에서 얼마든지 바꾸셔도 된다. 그건 여기 시각과
 * 달리 프로그램이 돌 때 설정에서 읽어 가는 값이라, 밖의 자명종과
 * 아무 상관이 없다.
 */
export const 발행시각 = "06:00";

export function 지금시각(): string {
  return 발행시각;
}

/** 자명종에게 줄 말. `분 시 * * *` 꼴이다. */
export function 크론식(): string {
  const [시, 분] = 발행시각.split(":");
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
  // 안 정하셨으면 **랜덤**. 순차로 두면 하루 상한에 걸려 뒤쪽 카테고리가
  // 늘 같은 자리에서 잘려서, 어떤 주제는 영영 안 나온다.
  return 값 === "sequential" || 값 === "random" || 값 === "least_used" ? 값 : "random";
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
