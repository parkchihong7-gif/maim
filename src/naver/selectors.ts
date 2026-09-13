import type { Frame, FrameLocator, Locator, Page } from "playwright";

/**
 * 네이버 스마트에디터 ONE의 DOM/iframe 구조는 예고 없이 바뀔 수 있다.
 * 여기에 셀렉터 후보를 폴백 배열로 모아두고, publisher.ts는 순서대로 시도한다.
 *
 * 주의: 아래 셀렉터들은 공개적으로 알려진 스마트에디터 ONE 구조를 기반으로 한
 * 최선의 추정치이며, 실제 로그인된 세션으로 헤드풀 모드에서 devtools로 확인한
 * 값이 아니다. 발행이 실패하면 `PLAYWRIGHT_HEADLESS=false npm run test:single-publish`로
 * 직접 열어 실제 셀렉터를 확인하고 이 파일을 갱신할 것.
 */

export const BLOG_WRITE_URL_TEMPLATE = "https://blog.naver.com/GoBlogWrite.naver";

export const EDITOR_IFRAME_SELECTORS = ["iframe#mainFrame"];

export const CONTINUE_DRAFT_POPUP_CANCEL_SELECTORS = [
  "button.se-popup-button-cancel",
  ".se-popup-dim-white button:has-text('취소')",
];

export const TITLE_SELECTORS = [
  ".se-title-text .se-text-paragraph",
  ".se-documentTitle .se-text-paragraph",
];

export const BODY_SELECTORS = [
  ".se-main-container .se-text-paragraph",
  ".se-component-content .se-text-paragraph",
];

export const IMAGE_TOOLBAR_BUTTON_SELECTORS = [
  "button.se-image-toolbar-button",
  ".se-toolbar-item-image button",
];

export const TAG_INPUT_SELECTORS = ["input#tag-input", ".tag_input__2A9dr"];

export const PUBLISH_BUTTON_SELECTORS = [
  "button.publish_btn__m9KHH",
  ".btn_area button:has-text('발행')",
];

export const SCHEDULE_TOGGLE_SELECTORS = ["label:has-text('예약')"];

export const SCHEDULE_DATE_INPUT_SELECTORS = [".date_area input"];

export const SCHEDULE_TIME_SELECT_SELECTORS = [".time_area select"];

export const CONFIRM_PUBLISH_BUTTON_SELECTORS = [
  "button:has-text('예약')",
  ".confirm_btn__WEaBq",
];

/** 후보 셀렉터를 순서대로 시도해 처음 발견되는 요소를 반환한다. 모두 실패하면 명확한 에러를 던진다. */
export async function locateFirst(
  scope: Frame | Page | FrameLocator,
  candidateSelectors: string[],
): Promise<Locator> {
  for (const selector of candidateSelectors) {
    const locator = scope.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0) {
      return locator;
    }
  }
  throw new Error(
    `셀렉터 후보가 모두 실패했습니다 (네이버 에디터 구조 변경 추정): [${candidateSelectors.join(", ")}]`,
  );
}
