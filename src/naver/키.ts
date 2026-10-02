/**
 * **네이버 키 다섯 개** — 블로그 검색 API 2개 + 검색광고 API 3개.
 *
 * 이미지 키와 같은 방식이다. 대시보드 [관리자 설정 → 5)] 에 저장한 값이
 * 먼저이고, 없으면 배포할 때 넣어 둔 환경변수를 쓴다.
 *
 * 둘 다 없어도 프로그램은 지금처럼 돈다. 네이버 키워드는 «있으면 더 좋은»
 * 기능이다.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getSetting } from "../db/repositories/settings.js";

export const 네이버키칸 = [
  "naver_search_client_id",
  "naver_search_client_secret",
  "naver_ad_api_key",
  "naver_ad_secret",
  "naver_ad_customer_id",
] as const;
export type 네이버키칸이름 = (typeof 네이버키칸)[number];

/** 칸 이름 → 환경변수 이름. 값은 저장소에 적지 않는다. */
const 환경변수: Record<네이버키칸이름, string> = {
  naver_search_client_id: "NAVER_SEARCH_CLIENT_ID",
  naver_search_client_secret: "NAVER_SEARCH_CLIENT_SECRET",
  naver_ad_api_key: "NAVER_AD_API_KEY",
  naver_ad_secret: "NAVER_AD_SECRET",
  naver_ad_customer_id: "NAVER_AD_CUSTOMER_ID",
};

export function 네이버키(칸: 네이버키칸이름): string | null {
  const 저장 = getSetting(칸);
  if (저장 && 저장.trim()) return 저장.trim();
  const 환경 = process.env[환경변수[칸]];
  return 환경 && 환경.trim() ? 환경.trim() : null;
}

export function 네이버키들() {
  return {
    searchId: 네이버키("naver_search_client_id"),
    searchSecret: 네이버키("naver_search_client_secret"),
    adKey: 네이버키("naver_ad_api_key"),
    adSecret: 네이버키("naver_ad_secret"),
    adCustomer: 네이버키("naver_ad_customer_id"),
  };
}

/** 환경변수로 들어온 네이버 키. 오류 문구에서 가릴 때 쓴다. */
export function 네이버환경키들(): string[] {
  return 네이버키칸.map((칸) => process.env[환경변수[칸]] ?? "").filter((v) => v.trim()).map((v) => v.trim());
}

/**
 * **넣는 자리에서 잡는다.**
 *
 * AI 키 검사(`키검사`)는 20자 미만을 막는데, 네이버 검색 API 의 Client
 * Secret 은 10자 안팎이고 검색광고 CUSTOMER_ID 는 숫자 몇 자리다. 그걸로
 * 검사하면 멀쩡한 키가 «너무 짧다» 로 막힌다. 그래서 칸마다 따로 본다.
 */
export function 네이버키검사(칸: 네이버키칸이름, 값: string): string {
  const 글 = (값 ?? "").trim();
  if (!글) return "키가 비어 있습니다.";
  if (/\s/.test(글)) return "키에 빈칸이나 줄바꿈이 섞여 있습니다. 앞뒤가 잘리지 않았는지 보시고 다시 붙여넣어 주세요.";
  const 딴글자 = [...글].find((c) => c.charCodeAt(0) < 33 || c.charCodeAt(0) > 126);
  if (딴글자) {
    return `키에 «${딴글자}» 같은 글자가 들어 있습니다. 네이버 키는 영문·숫자·기호로만 되어 있습니다. `
         + "안내 글자를 지우지 않고 넣으셨거나, 다른 것을 붙여넣으신 것 같습니다.";
  }
  if (칸 === "naver_ad_customer_id") {
    if (!/^\d{3,12}$/.test(글)) return "CUSTOMER_ID 는 숫자만 있습니다. [API 사용 관리] 화면의 숫자를 그대로 넣어 주세요.";
    return "";
  }
  const 최소: Record<string, number> = {
    naver_search_client_id: 10, naver_search_client_secret: 6,
    naver_ad_api_key: 20, naver_ad_secret: 20,
  };
  if (글.length < 최소[칸]) return `키가 너무 짧습니다 (${글.length}자). 앞부분만 복사되지 않았는지 보아 주세요.`;
  return "";
}

/**
 * **가짜 모드** — `NAVER_FAKE=1`.
 *
 * 작업 환경에서는 네이버에 접속이 막혀 있다. 시험과 로컬 화면 확인은
 * `tools/fake-naver.json` 의 고정 답으로 한다(`fake-claude.mjs` 와 같은 발상).
 */
export function 가짜모드(): boolean {
  return process.env.NAVER_FAKE === "1";
}

let 가짜답: any = null;
export function 가짜자료(): any {
  if (가짜답) return 가짜답;
  const 파일 = process.env.NAVER_FAKE_FILE || path.join(config.paths.projectRoot, "tools", "fake-naver.json");
  가짜답 = JSON.parse(fs.readFileSync(파일, "utf8"));
  return 가짜답;
}

/** 두 API 가 같이 쓰는 «실패» 모양. 예외를 던지지 않고 이걸 돌려준다. */
export type 네이버실패 = { ok: false; why: string; status?: number };

/** 응답 코드를 사람 말로. 키 값은 절대 문구에 넣지 않는다. */
export function 코드사유(status: number, 본문: string): string {
  if (status === 401 || status === 403) return `키를 다시 확인하세요 (${status}). 칸이 서로 바뀌지 않았는지도 보아 주세요.`;
  if (status === 429) return "잠시 너무 많이 불렀습니다 (429). 1분쯤 뒤에 다시 해 보세요.";
  const 짧게 = 본문.replace(/\s+/g, " ").slice(0, 160);
  return `네이버가 ${status} 로 답했습니다${짧게 ? ` — ${짧게}` : ""}`;
}

export const 네이버한도ms = 10_000;
