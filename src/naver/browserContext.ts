import { chromium, type Browser, type BrowserContext } from "playwright";
import fs from "node:fs";
import { config } from "../config.js";

export async function launchBrowser(options: { headless?: boolean } = {}): Promise<Browser> {
  return chromium.launch({
    headless: options.headless ?? config.playwrightHeadless,
    executablePath: config.playwrightExecutablePath,
  });
}

/** 저장된 네이버 세션이 있으면 로드하고, 없으면 빈 컨텍스트를 만든다. */
export async function createContext(browser: Browser): Promise<BrowserContext> {
  if (fs.existsSync(config.paths.naverSessionFile)) {
    return browser.newContext({ storageState: config.paths.naverSessionFile });
  }
  return browser.newContext();
}

export async function saveSessionState(context: BrowserContext): Promise<void> {
  fs.mkdirSync(config.paths.dataDir, { recursive: true });
  await context.storageState({ path: config.paths.naverSessionFile });
}

export function hasSavedSession(): boolean {
  return fs.existsSync(config.paths.naverSessionFile);
}
