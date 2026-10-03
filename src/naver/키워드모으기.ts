/**
 * **키워드 모으기** — 🔎 네이버 키워드 탭의 [지금 모으기].
 *
 * 글쓰기와 **완전히 따로** 돈다. 아침 6시 작업도, [지금 생성] 도 이것을
 * 부르지 않는다. 사장님이 탭에서 누를 때만 돈다.
 *
 *   1단계  검색광고 API — 씨앗으로 연관 키워드·월 검색량·경쟁 정도
 *          거르기: 빼야 할 말 · 검색량 100 미만 · 이미 쓴 키워드
 *   2단계  블로그 검색 API — 검색량 상위 50개의 «이미 쓰인 글 수» 와 상위 글 제목
 *          → 비율 = 문서 수 ÷ 검색량 → 등급
 *   3단계  등급순 상위 30개만 보관함에 남긴다
 *
 * 한 줄씩 받는 즉시 보관함에 적는다. 5분이 넘거나 [중지] 를 누르면 그 자리에서
 * 멈추고, 멈춘 자리(kw_job)를 적어 둔다 — [이어서 모으기] 는 남은 것만 한다.
 *
 * Cloud Run 은 요청이 열려 있을 때만 CPU 를 준다. 그래서 [지금 모으기] 요청이
 * 끝까지 기다렸다가 답한다(최대 5분, 서비스 한도 30분 안). 화면은 그 사이
 * 진행 상황을 따로 물어본다(같은 서버, 메모리의 `진행들`).
 */
import type { Category } from "../db/repositories/categories.js";
import { getCategory, 키워드칸적기 } from "../db/repositories/categories.js";
import { listRecentTitles } from "../db/repositories/posts.js";
import { 보관함넣기, 보관함목록, 보관함정리 } from "../db/repositories/keywordPool.js";
import { 지금주인 } from "../tenancy.js";
import { 연관키워드, 씨앗다듬기, type 연관어 } from "./검색광고.js";
import { 블로그검색 } from "./블로그검색.js";
import { 비율, 등급매기기, 등급순, type 등급 } from "./키워드점수.js";

export const 모으기한도ms = 5 * 60_000;
export const 남길개수 = 30;
export const 확인개수 = 50;
export const 최소검색량 = 100;
/** 블로그 검색 API 를 너무 몰아 부르지 않게. */
const 사이ms = Number(process.env.NAVER_GAP_MS ?? 120);

export interface 모으기진행 {
  categoryId: number;
  state: "running" | "done" | "paused" | "stopped" | "error";
  stage: 1 | 2 | 3;
  stageName: string;
  startedAt: string;
  elapsedMs: number;
  /** 연관 키워드 받은 수 */
  received: number;
  /** 거르고 남은 수(검색량 100 이상, 빼야 할 말 없음) */
  filtered: number;
  /** 이미 쓴 키워드라 뺀 수 */
  excludedUsed: number;
  /** 문서 수 확인: 한 것 / 할 것 */
  checked: number;
  toCheck: number;
  /** 문서 수를 못 받은 수(미확인) */
  unknown: number;
  /** 보관함에 남긴 수 */
  kept: number;
  message: string;
  /** 1단계에서 거른 까닭별 수 — 다 걸러져 0개가 되면 화면에 그대로 보인다 */
  dropped?: { lowVolume: number; excluded: number; used: number; relaxed: boolean };
  /** 이번에 쓴 씨앗(기호·띄어쓰기 뺀 것) */
  seeds?: string[];
}

/** 멈춘 자리. categories.kw_job 에 JSON 으로 둔다. */
interface 멈춘자리 {
  startedAt: string;
  seeds: string[];
  candidates: (연관어 & { seed: string })[];
  done: string[];
  received: number;
  excludedUsed: number;
}

const 진행들 = new Map<string, 모으기진행>();
const 멈춤요청 = new Set<string>();
const 열쇠 = (categoryId: number) => `${지금주인()}:${categoryId}`;

export function 모으기진행보기(categoryId: number): 모으기진행 | null {
  const 것 = 진행들.get(열쇠(categoryId));
  if (!것) return null;
  if (것.state === "running") 것.elapsedMs = Date.now() - Date.parse(것.startedAt);
  return 것;
}

export function 모으기멈추기(categoryId: number): boolean {
  const 것 = 진행들.get(열쇠(categoryId));
  if (!것 || 것.state !== "running") return false;
  멈춤요청.add(열쇠(categoryId));
  return true;
}

/** 카테고리에서 씨앗을 뽑는다 — 이름 · 주제 키워드 · 함께 들어갈 말. 화면에도 이걸 보인다. */
export function 씨앗뽑기(category: Category): string[] {
  const 직접 = 직접씨앗(category);
  if (직접.length) return 직접;
  const 함께 = String(category.must_keywords ?? "").split(/[,\n]+/);
  const 후보 = [category.name, category.topic_keyword ?? "", ...함께].map((x) => String(x).trim()).filter(Boolean);
  const 본 = new Set<string>();
  const 답: string[] = [];
  for (const 말 of 후보) {
    const 붙임 = 말.replace(/\s+/g, "");
    if (!붙임 || 본.has(붙임)) continue;
    본.add(붙임);
    답.push(말);
    if (답.length >= 5) break;
  }
  return 답;
}

/** 🔎 탭 ② 에서 직접 정한 씨앗(최대 5개). 없으면 []. */
export function 직접씨앗(category: Category): string[] {
  try {
    const v = JSON.parse(category.kw_seeds ?? "[]");
    return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 5) : [];
  } catch { return []; }
}

const 붙여 = (s: string) => String(s ?? "").replace(/\s+/g, "").toLowerCase();

/** 쉬는 사이. 시험에서는 NAVER_GAP_MS=0. */
const 쉬기 = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export async function 키워드모으기(categoryId: number, 옵션: { 이어서?: boolean } = {}): Promise<모으기진행> {
  const category = getCategory(categoryId);
  if (!category) throw new Error("카테고리를 찾을 수 없습니다.");
  const 키 = 열쇠(categoryId);
  const 지금것 = 진행들.get(키);
  if (지금것 && 지금것.state === "running") return 지금것;
  멈춤요청.delete(키);

  const 시작 = Date.now();
  let 자리: 멈춘자리 | null = null;
  if (옵션.이어서 && category.kw_job) {
    try { 자리 = JSON.parse(category.kw_job) as 멈춘자리; } catch { 자리 = null; }
  }

  const 진행: 모으기진행 = {
    categoryId, state: "running", stage: 1, stageName: "연관 키워드 받기",
    startedAt: new Date(시작).toISOString(), elapsedMs: 0,
    received: 자리?.received ?? 0, filtered: 자리?.candidates.length ?? 0, excludedUsed: 자리?.excludedUsed ?? 0,
    checked: 자리?.done.length ?? 0, toCheck: 자리?.candidates.length ?? 0, unknown: 0, kept: 0, message: "",
  };
  진행들.set(키, 진행);

  const 끝 = (state: 모으기진행["state"], message: string) => {
    진행.state = state;
    진행.message = message;
    진행.elapsedMs = Date.now() - 시작;
    멈춤요청.delete(키);
    // 마지막 결과는 표에도 남긴다 — 서버가 여러 대로 늘었거나 다시 켜져도 화면이 «왜 끝났는지» 를 보여 주게.
    try { 키워드칸적기(categoryId, { kw_last: JSON.stringify(진행) }); } catch { /* 결과 기록 실패는 무시 */ }
    return 진행;
  };

  try {
    // ── 1단계: 연관 키워드 ───────────────────────────────────────
    if (!자리) {
      const seeds = 씨앗뽑기(category);
      if (!seeds.length) {
        키워드칸적기(categoryId, { kw_error: "씨앗이 없습니다 — 카테고리 이름을 확인하세요." });
        return 끝("error", "씨앗이 없습니다 — 카테고리 이름을 확인하세요.");
      }
      const 답 = await 연관키워드(seeds);
      if (!답.ok) {
        키워드칸적기(categoryId, { kw_error: 답.why });
        return 끝("error", 답.why);
      }
      진행.received = 답.rows.length;

      진행.seeds = 씨앗다듬기(seeds);
      const 빼기 = String(category.exclude_keywords ?? "").split(/[,\n]+/).map(붙여).filter(Boolean);
      const 쓴제목 = listRecentTitles(100).map(붙여);
      const 쓴키워드 = new Set(보관함목록(categoryId).filter((r) => r.status !== "candidate").map((r) => 붙여(r.keyword)));
      const 붙인씨앗 = seeds.map((s) => ({ s, 붙: 붙여(s) }));

      // 거르기. 다 걸러져 0개면 한 번 느슨하게 다시 거른다 —
      // 검색량 100 → 10, «최근 제목에 들어 있음» 은 빼고 «씀·보류» 만 뺀다.
      // (매일 글을 쓰는 카테고리는 짧은 연관어가 거의 다 지난 제목에 들어 있어 전부 빠지던 일이 있었다.)
      const 거르기 = (느슨: boolean) => {
        const 셈 = { lowVolume: 0, excluded: 0, used: 0, relaxed: 느슨 };
        const 남: (연관어 & { seed: string })[] = [];
        const 본 = new Set<string>();
        for (const 줄 of 답.rows) {
          const 말 = 붙여(줄.keyword);
          if (!말 || 본.has(말)) continue;
          본.add(말);
          if (빼기.some((w) => 말.includes(w))) { 셈.excluded += 1; continue; }
          if (줄.pc + 줄.mobile < (느슨 ? 10 : 최소검색량)) { 셈.lowVolume += 1; continue; }
          if (쓴키워드.has(말) || (!느슨 && 쓴제목.some((t) => t.includes(말)))) { 셈.used += 1; continue; }
          const 씨앗 = 붙인씨앗.find((x) => 말.includes(x.붙))?.s ?? seeds[0];
          남.push({ ...줄, seed: 씨앗 });
        }
        return { 남, 셈 };
      };
      let 걸러 = 거르기(false);
      if (!걸러.남.length && 답.rows.length) 걸러 = 거르기(true);
      const 남은 = 걸러.남;
      const 이미씀 = 걸러.셈.used;
      진행.dropped = 걸러.셈;
      if (!남은.length) {
        const 까닭 = 답.rows.length
          ? `연관 키워드 ${답.rows.length}개를 받았지만 모두 걸러졌습니다 (검색량 부족 ${걸러.셈.lowVolume} · 빼야 할 말 ${걸러.셈.excluded} · 이미 씀·보류 ${걸러.셈.used}). `
            + "② 의 «씨앗 직접 정하기» 에 더 넓은 말을 넣어 보세요."
          : `네이버가 연관 키워드를 0개 돌려줬습니다 (씨앗: ${진행.seeds.join(", ")}). ② 의 «씨앗 직접 정하기» 에 더 흔한 말을 넣어 보세요.`;
        키워드칸적기(categoryId, { kw_error: 까닭 });
        return 끝("error", 까닭);
      }
      남은.sort((a, b) => (b.pc + b.mobile) - (a.pc + a.mobile));
      자리 = {
        startedAt: 진행.startedAt, seeds: 씨앗다듬기(seeds), candidates: 남은.slice(0, 확인개수),
        done: [], received: 답.rows.length, excludedUsed: 이미씀,
      };
      진행.filtered = 남은.length;
      진행.excludedUsed = 이미씀;
      진행.toCheck = 자리.candidates.length;
      키워드칸적기(categoryId, { kw_job: JSON.stringify(자리), kw_error: null });
    }

    // ── 2단계: 블로그 문서 수 ────────────────────────────────────
    진행.stage = 2;
    진행.stageName = "블로그 문서 수 확인";
    const 했던 = new Set(자리.done);
    let 몇번째 = 0;
    let 이번성공 = false;
    const 처음실패: string[] = [];
    for (const 줄 of 자리.candidates) {
      if (했던.has(줄.keyword)) continue;
      if (멈춤요청.has(키) || Date.now() - 시작 > 모으기한도ms) {
        키워드칸적기(categoryId, { kw_job: JSON.stringify(자리) });
        const 멈춘까닭 = 멈춤요청.has(키) ? "stopped" : "paused";
        return 끝(멈춘까닭, 멈춘까닭 === "stopped"
          ? "멈췄습니다. 모은 것은 남아 있습니다 — [이어서 모으기] 로 남은 것만 할 수 있습니다."
          : "5분이 넘어 멈췄습니다. 모은 것은 남아 있습니다 — [이어서 모으기] 로 남은 것만 할 수 있습니다.");
      }
      if (몇번째++ > 0) await 쉬기(사이ms);
      const 검색량 = 줄.pc + 줄.mobile;
      const 블 = await 블로그검색(줄.keyword, 10);
      const 문서 = 블.ok ? 블.total : null;
      const 값 = 비율(문서, 검색량);
      // 이번에 한 번도 성공 못 한 채 처음 세 개가 실패하면 블로그 검색 API 자체의 문제다(키·앱 설정).
      // 50개를 다 «미확인» 으로 채우지 말고 그 자리에서 까닭을 알린다. 실패한 것은 적지 않고(이어서 할 때 다시 본다),
      // 받은 연관 키워드는 남겨 두어 키를 고친 뒤 [이어서 모으기] 로 잇는다.
      if (!블.ok && !이번성공) {
        처음실패.push(줄.keyword);
        if (처음실패.length >= 3) {
          키워드칸적기(categoryId, { kw_job: JSON.stringify(자리), kw_error: `블로그 검색 API 가 답하지 않습니다 — ${블.why}` });
          return 끝("error", `블로그 검색 API 가 답하지 않습니다 — ${블.why} · 키를 고친 뒤 [이어서 모으기] 를 누르세요(받은 연관 키워드는 남아 있습니다).`);
        }
        continue;
      }
      if (블.ok && !이번성공) {
        이번성공 = true;
        처음실패.splice(0);   // 한 번 되면 앞의 실패는 일시적인 것 — 그 한두 개만 이번 보관함에서 빠진다
      }
      if (!블.ok) 진행.unknown += 1;
      보관함넣기(categoryId, {
        keyword: 줄.keyword, pc: 줄.pc, mobile: 줄.mobile, comp: 줄.comp,
        doc_total: 문서, ratio: 값, grade: 등급매기기(값), seed: 줄.seed, top: 블.ok ? 블.items : [],
      });
      자리.done.push(줄.keyword);
      진행.checked = 자리.done.length;
      if (자리.done.length % 5 === 0) 키워드칸적기(categoryId, { kw_job: JSON.stringify(자리) });
    }

    // ── 3단계: 상위 30개만 남기기 ────────────────────────────────
    진행.stage = 3;
    진행.stageName = "보관함 정리";
    const 이번것 = new Set(자리.candidates.map((c) => c.keyword));
    const 대기 = 보관함목록(categoryId).filter((r) => r.status === "candidate" && 이번것.has(r.keyword));
    const 남길 = 대기
      .map((r) => ({ keyword: r.keyword, grade: r.grade as 등급, pc: r.pc ?? 0, mobile: r.mobile ?? 0 }))
      .sort(등급순).slice(0, 남길개수).map((r) => r.keyword);
    보관함정리(categoryId, 남길);
    진행.kept = 남길.length;
    키워드칸적기(categoryId, { kw_refreshed_at: new Date().toISOString(), kw_job: null, kw_error: null });
    return 끝("done", `${남길.length}개를 보관함에 넣었습니다.`);
  } catch (err) {
    const 말 = `모으다 멈췄습니다 — ${(err as Error).message}`;
    키워드칸적기(categoryId, { kw_error: 말, ...(자리 ? { kw_job: JSON.stringify(자리) } : {}) });
    return 끝("error", 말);
  }
}

/** 시험용 — 메모리의 진행 기록을 비운다. */
export function 진행비우기(): void { 진행들.clear(); 멈춤요청.clear(); }

/**
 * 키워드 **하나를 직접** 보관함에 넣는다 — 탭에서 사람이 적거나, 트렌드·벤치마킹에서 고른 말.
 * 검색량(검색광고)·문서 수(블로그 검색)를 확인해 등급을 매긴다. 다시 모아도 지워지지 않는다(seed «직접…»).
 */
export async function 키워드하나넣기(categoryId: number, keyword: string, 어디서 = "직접 추가"): Promise<{ ok: true; grade: 등급 } | { ok: false; why: string }> {
  const 말 = String(keyword ?? "").trim().slice(0, 40);
  if (말.length < 2) return { ok: false, why: "두 글자 이상 넣어 주세요." };
  const 붙 = 붙여(말);
  const 광고 = await 연관키워드([말]);
  const 줄 = 광고.ok ? 광고.rows.find((r) => 붙여(r.keyword) === 붙) : undefined;
  const 블 = await 블로그검색(말, 10);
  const 검색량 = 줄 ? 줄.pc + 줄.mobile : 0;
  const 값 = 비율(블.ok ? 블.total : null, 검색량);
  const grade = 등급매기기(값);
  보관함넣기(categoryId, {
    keyword: 말, pc: 줄?.pc ?? 0, mobile: 줄?.mobile ?? 0, comp: 줄?.comp ?? "",
    doc_total: 블.ok ? 블.total : null, ratio: 값, grade, seed: `직접:${어디서}`.slice(0, 60), top: 블.ok ? 블.items : [],
  });
  return { ok: true, grade };
}
