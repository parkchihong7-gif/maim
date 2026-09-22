/**
 * 통합 관리자 대시보드의 접속키를 확인하는 길.
 *
 * 왜 여기서 확인하나
 *   이 프로그램은 예전에 **자기 접속 코드**를 따로 만들어 썼다. 모양은
 *   같았지만(1차 초대 → 2차 기기별 3개) 장부가 달라서, 대시보드에서 판 키가
 *   여기서는 안 통했다. 파는 곳과 여는 곳이 다르면 누구에게 무엇을 팔았는지
 *   한 군데서 볼 수가 없다.
 *
 *   이제 장부는 하나다. 앱스 스크립트(구글 시트)가 들고 있고, 대시보드도
 *   1번 프로그램도 이 프로그램도 같은 곳에 묻는다.
 *
 * 규약
 *   validateKeyPair  1차키 + 2차키가 맞나 → 맞으면 세션값을 준다
 *   checkSession     그 기기가 아직 주인인가 → 다른 기기가 들어오면 false
 *
 * 키는 **프로그램마다 따로**다. `program` 을 안 보내면 서버가 다른
 * 프로그램의 장부를 뒤지게 되어, 3번 키로 1번이 열리거나 그 반대가 된다.
 */

import { config } from "./config.js";

export interface KeyOk {
  ok: true;
  sessionToken?: string;
  role?: string;
  name?: string;
  deviceLabel?: string;
}

export interface KeyNo {
  ok: false;
  reason?: string;
  message?: string;
}

export type KeyAnswer = KeyOk | KeyNo;

/** 키 서버가 느릴 때 화면이 영영 안 돌아오지 않게. */
const TIMEOUT_MS = 20_000;

export function keyserverEnabled(): boolean {
  return !!config.keyserverUrl;
}

async function ask(params: Record<string, string>): Promise<KeyAnswer> {
  if (!config.keyserverUrl) {
    return { ok: false, reason: "not_configured",
             message: "접속키 서버가 설정되지 않았습니다. KEYSERVER_URL 을 넣어 주세요." };
  }
  const qs = new URLSearchParams({ ...params, program: config.keyserverProgram });
  const stop = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.keyserverUrl}?${qs.toString()}`, { signal: stop });
  } catch {
    // 인터넷이 끊겼거나 주소가 틀렸다. 어느 쪽인지 쓰는 분은 모르므로
    // 무엇을 봐야 하는지 알려 준다.
    return { ok: false, reason: "unreachable",
             message: "접속키 서버에 닿지 못했습니다. 잠시 후 다시 시도해주세요." };
  }
  try {
    return (await res.json()) as KeyAnswer;
  } catch {
    // 로그인 화면(HTML)이 내려오는 경우가 여기다. 앱스 스크립트를 배포할 때
    // '액세스 권한이 있는 사용자' 를 '모든 사용자' 로 안 두면 그렇게 된다.
    return { ok: false, reason: "bad_answer",
             message: "접속키 서버가 이상한 답을 보냈습니다. 배포 설정을 확인해주세요." };
  }
}

/** 1차키 + 2차키를 확인한다. 맞으면 `sessionToken` 이 들어 있다. */
export function validateKeyPair(key1: string, key2: string): Promise<KeyAnswer> {
  return ask({ action: "validateKeyPair", key1, key2 });
}

/** 이 기기가 아직 주인인지 묻는다. 화면이 1분마다 부른다. */
export function checkSession(key2: string, remoteToken: string): Promise<KeyAnswer> {
  return ask({ action: "checkSession", key: key2, sessionToken: remoteToken });
}
