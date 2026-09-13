import path from "node:path";
import fs from "node:fs";
import { DateTime } from "luxon";
import type { FrameLocator, Locator, Page } from "playwright";
import { launchBrowser, createContext, hasSavedSession } from "./browserContext.js";
import * as sel from "./selectors.js";
import type { Post } from "../db/repositories/posts.js";
import { markPublished, markFailed } from "../db/repositories/posts.js";
import { config } from "../config.js";

export class SessionExpiredError extends Error {}

function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 사람처럼 보이도록 타이핑 속도에 랜덤 지연을 섞는다 (완화책일 뿐, 우회를 보장하지 않는다). */
async function typeHumanLike(locator: Locator, text: string): Promise<void> {
  await locator.click();
  const page = locator.page();
  for (const line of text.split("\n")) {
    if (line.length > 0) {
      await page.keyboard.type(line, { delay: 15 + Math.random() * 35 });
    }
    await page.keyboard.press("Enter");
    await randomDelay(80, 250);
  }
}

/**
 * 스마트에디터 iframe을 FrameLocator로 얻는다. 엘리먼트 핸들을 미리 잡아뒀다가
 * 나중에 contentFrame()을 호출하는 방식은, 그 사이 네이버가 로딩 placeholder
 * iframe을 실제 에디터 iframe으로 교체하면 핸들이 detach되어 깨진다.
 * FrameLocator는 쓰일 때마다 새로 resolve하므로 이 문제가 없다.
 */
async function locateEditorFrame(page: Page, timeoutMs = 30_000): Promise<FrameLocator> {
  for (const selector of sel.EDITOR_IFRAME_SELECTORS) {
    const appeared = await page
      .waitForSelector(selector, { timeout: timeoutMs })
      .then(() => true)
      .catch(() => false);
    if (appeared) {
      return page.frameLocator(selector);
    }
  }
  throw new Error(
    `에디터 iframe을 찾지 못했습니다 (셀렉터 변경 추정): [${sel.EDITOR_IFRAME_SELECTORS.join(", ")}]`,
  );
}

/**
 * 네이버 스마트에디터 ONE을 Playwright로 직접 조작해 포스팅 1건을 예약 발행한다.
 * 셀렉터는 selectors.ts에 중앙화되어 있으며, 구조가 바뀌면 그쪽만 갱신하면 된다.
 */
export async function publishPost(post: Post): Promise<void> {
  const errorScreenshotPath = path.join(config.paths.generatedDir, String(post.id), "error.png");
  let browser: Awaited<ReturnType<typeof launchBrowser>> | undefined;
  let context: Awaited<ReturnType<typeof createContext>> | undefined;
  let page: Awaited<ReturnType<Awaited<ReturnType<typeof createContext>>["newPage"]>> | undefined;

  try {
    if (!hasSavedSession()) {
      throw new SessionExpiredError("저장된 네이버 세션이 없습니다. `npm run login`으로 먼저 로그인하세요.");
    }
    if (!post.image_path || !fs.existsSync(post.image_path)) {
      throw new Error(`포스팅 ${post.id}에 유효한 이미지가 없습니다: ${post.image_path}`);
    }

    browser = await launchBrowser();
    context = await createContext(browser);
    page = await context.newPage();

    await page.goto(sel.BLOG_WRITE_URL_TEMPLATE, { waitUntil: "domcontentloaded" });

    if (page.url().includes("nidlogin")) {
      throw new SessionExpiredError("발행 중 로그인 페이지로 리다이렉트됨 — 세션이 만료된 것으로 보입니다.");
    }

    const frame = await locateEditorFrame(page);

    for (const cancelSel of sel.CONTINUE_DRAFT_POPUP_CANCEL_SELECTORS) {
      const btn = page.locator(cancelSel).first();
      if ((await btn.count().catch(() => 0)) > 0) {
        await btn.click().catch(() => {});
        break;
      }
    }

    const titleLocator = await sel.locateFirst(frame, sel.TITLE_SELECTORS);
    await typeHumanLike(titleLocator, post.title ?? "");
    await randomDelay(300, 800);

    const bodyLocator = await sel.locateFirst(frame, sel.BODY_SELECTORS);
    await typeHumanLike(bodyLocator, post.content ?? "");
    await randomDelay(300, 800);

    const imageButton = await sel.locateFirst(frame, sel.IMAGE_TOOLBAR_BUTTON_SELECTORS);
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser", { timeout: 15_000 }),
      imageButton.click(),
    ]);
    await fileChooser.setFiles(post.image_path);
    await randomDelay(1500, 3000);

    const publishButton = await sel.locateFirst(page, sel.PUBLISH_BUTTON_SELECTORS);
    await publishButton.click();
    await randomDelay(300, 700);

    const tagInput = await sel.locateFirst(page, sel.TAG_INPUT_SELECTORS).catch(() => null);
    if (tagInput && post.tags_json) {
      const tags: string[] = JSON.parse(post.tags_json);
      for (const tag of tags) {
        await tagInput.type(tag.replace(/^#/, ""), { delay: 20 });
        await page.keyboard.press("Enter");
        await randomDelay(100, 250);
      }
    }

    if (post.scheduled_at) {
      const scheduleToggle = await sel.locateFirst(page, sel.SCHEDULE_TOGGLE_SELECTORS).catch(() => null);
      if (scheduleToggle) {
        await scheduleToggle.click();
        const dt = DateTime.fromISO(post.scheduled_at, { zone: "utc" }).setZone(config.timezone);
        const dateInput = await sel.locateFirst(page, sel.SCHEDULE_DATE_INPUT_SELECTORS).catch(() => null);
        if (dateInput) await dateInput.fill(dt.toFormat("yyyy-MM-dd"));
        const timeSelect = await sel
          .locateFirst(page, sel.SCHEDULE_TIME_SELECT_SELECTORS)
          .catch(() => null);
        if (timeSelect) await timeSelect.selectOption({ label: dt.toFormat("HH:mm") }).catch(() => {});
      }
    }

    const confirmButton = await sel.locateFirst(page, sel.CONFIRM_PUBLISH_BUTTON_SELECTORS);
    await confirmButton.click();
    await randomDelay(1000, 2000);

    markPublished(post.id);
  } catch (err) {
    if (page) {
      fs.mkdirSync(path.dirname(errorScreenshotPath), { recursive: true });
      await page.screenshot({ path: errorScreenshotPath }).catch(() => {});
    }
    markFailed(post.id, (err as Error).message);
    throw err;
  } finally {
    await context?.close();
    await browser?.close();
  }
}
