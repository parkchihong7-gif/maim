/**
 * Playwright Chromium 설치 여부를 확인하고, 없으면 자동으로 설치한다.
 * 로컬/VPS 첫 설정 시 `npm run setup`으로 실행한다.
 */
import { execSync } from "node:child_process";
import { chromium } from "playwright";
import { config } from "../src/config.js";

async function isChromiumAvailable(): Promise<boolean> {
  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: config.playwrightExecutablePath,
    });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("Playwright Chromium 설치 상태 확인 중...");
  if (await isChromiumAvailable()) {
    console.log("이미 설치되어 있습니다.");
    return;
  }

  console.log("Chromium을 찾지 못했습니다. 설치를 진행합니다: npx playwright install chromium");
  execSync("npx playwright install chromium", { stdio: "inherit" });

  if (config.deploymentMode === "vps") {
    console.log(
      "\nVPS에서는 시스템 라이브러리도 필요할 수 있습니다. 다음 명령을 한 번 더 실행해주세요:\n  npx playwright install --with-deps chromium",
    );
  }

  console.log("설치 완료.");
}

main().catch((err) => {
  console.error("설치 확인/진행 중 오류:", err);
  process.exit(1);
});
