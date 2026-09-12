/**
 * 사용자가 자신의 로컬 PC에서 직접 실행하는 네이버 로그인 스크립트.
 * 실제 브라우저 창이 뜨므로 디스플레이가 있는 환경에서만 동작한다.
 *
 * 사용법: npm run login
 */
import { runManualLogin } from "../src/naver/login.js";

async function main() {
  console.log("브라우저 창이 열립니다. 네이버에 직접 로그인해주세요 (최대 10분 대기)...");
  const result = await runManualLogin();
  console.log(result.message);
  if (!result.success) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
