/**
 * Phase 4 검증 스크립트 (하부 메커니즘 한정).
 *
 * 실제 네이버 로그인은 2FA/캡차를 사람이 직접 통과해야 하므로 이 자동화 스크립트로는
 * 검증할 수 없다 (`npm run login`으로 사용자가 로컬 PC에서 직접 수행해야 함).
 * 대신 여기서는 login.ts/browserContext.ts가 의존하는 핵심 메커니즘 —
 * storageState 저장 -> 새 헤드리스 컨텍스트에서 재사용 -> 로그인 상태(쿠키) 복원 —
 * 이 실제로 동작하는지를 중립적인 테스트 쿠키로 검증한다.
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { config } from "../src/config.js";

const TEST_SESSION_FILE = path.join(config.paths.dataDir, "test-session-state.json");

async function main() {
  console.log("=== Playwright storageState 저장/재사용 메커니즘 검증 ===");
  console.log(
    "(실제 네이버 로그인은 `npm run login`으로 사용자가 로컬 PC에서 직접 수행해야 합니다. 이 테스트는 그 하부 메커니즘만 검증합니다.)\n",
  );

  const browser1 = await chromium.launch({
    headless: true,
    executablePath: config.playwrightExecutablePath,
  });
  const context1 = await browser1.newContext();
  await context1.addCookies([
    {
      name: "TEST_AUTH_COOKIE",
      value: "session-abc-123",
      domain: "example.com",
      path: "/",
    },
  ]);
  await context1.storageState({ path: TEST_SESSION_FILE });
  await browser1.close();
  console.log("1) 첫 번째 컨텍스트에서 쿠키 설정 후 storageState 저장 완료:", TEST_SESSION_FILE);

  const browser2 = await chromium.launch({
    headless: true,
    executablePath: config.playwrightExecutablePath,
  });
  const context2 = await browser2.newContext({ storageState: TEST_SESSION_FILE });
  const cookies = await context2.cookies("https://example.com");
  await browser2.close();

  const found = cookies.find((c) => c.name === "TEST_AUTH_COOKIE");
  if (found?.value === "session-abc-123") {
    console.log("2) 새 헤드리스 컨텍스트에서 storageState 로드 후 쿠키 재사용 확인: 성공");
  } else {
    throw new Error("storageState 재사용 실패 — 쿠키가 복원되지 않았습니다.");
  }

  fs.unlinkSync(TEST_SESSION_FILE);
  console.log(
    "\n결론: browserContext.ts의 저장/로드 메커니즘은 정상 동작합니다.\n실제 네이버 로그인 검증은 사용자가 `npm run login`으로 직접 수행해야 합니다.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
