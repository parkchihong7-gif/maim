import { launchBrowser, saveSessionState } from "./browserContext.js";
import { setSetting } from "../db/repositories/settings.js";

const NAVER_LOGIN_URL = "https://nid.naver.com/nidlogin.login";
const NAVER_HOME_URL = "https://www.naver.com";

export interface LoginResult {
  success: boolean;
  message: string;
}

/**
 * 실제(헤드풀) 브라우저 창을 띄워 사용자가 직접 네이버에 로그인하도록 한다.
 * 2FA/캡차는 사람만 통과할 수 있으므로 절대 자동 입력을 시도하지 않는다.
 * 로그인 성공은 인증 쿠키 존재 + 로그인 페이지 이탈로 폴링 감지한 뒤 storageState를 저장한다.
 *
 * 디스플레이가 있는 로컬 PC에서만 실행 가능하다 (VPS는 세션 파일 가져오기로 대체).
 */
export async function runManualLogin(options: { timeoutMs?: number } = {}): Promise<LoginResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const browser = await launchBrowser({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(NAVER_LOGIN_URL);

  const deadline = Date.now() + timeoutMs;
  let loggedIn = false;

  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    try {
      const cookies = await context.cookies("https://www.naver.com");
      const hasAuthCookie = cookies.some((c) => c.name === "NID_AUT" || c.name === "NID_SES");
      const stillOnLoginPage = page.url().includes("nidlogin");
      if (hasAuthCookie && !stillOnLoginPage) {
        loggedIn = true;
        break;
      }
    } catch {
      // 페이지 전환 중 일시적 에러는 무시하고 계속 폴링한다.
    }
  }

  if (!loggedIn) {
    await browser.close();
    return { success: false, message: `로그인 대기 시간(${timeoutMs}ms) 초과 — 로그인을 완료하지 못했습니다.` };
  }

  await page.goto(NAVER_HOME_URL).catch(() => {});
  await saveSessionState(context);
  await browser.close();

  setSetting("naverLoginStatus", "connected");
  setSetting("naverLoginAt", new Date().toISOString());

  return { success: true, message: "로그인 성공 — 세션이 저장되었습니다." };
}
