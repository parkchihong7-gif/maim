/**
 * 로컬에 저장된 네이버 로그인 세션을 암호화해 VPS로 옮길 수 있는 파일로 내보낸다.
 *
 * 사용법: npm run export-session -- <passphrase>
 * (또는 .env의 SESSION_EXPORT_PASSPHRASE를 설정해두면 인자 생략 가능)
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { encryptBuffer } from "../src/utils/crypto.js";

function main() {
  if (!fs.existsSync(config.paths.naverSessionFile)) {
    console.error("저장된 세션 파일이 없습니다. 먼저 `npm run login`으로 로그인하세요.");
    process.exit(1);
  }

  const passphrase = process.argv[2] || config.sessionExportPassphrase;
  if (!passphrase) {
    console.error(
      "암호가 필요합니다. .env의 SESSION_EXPORT_PASSPHRASE를 설정하거나 인자로 전달하세요:\n  npm run export-session -- <passphrase>",
    );
    process.exit(1);
  }

  const plain = fs.readFileSync(config.paths.naverSessionFile);
  const encrypted = encryptBuffer(plain, passphrase);
  const outPath = path.join(config.paths.dataDir, "naver-session.enc");
  fs.writeFileSync(outPath, encrypted);

  console.log(`암호화된 세션 파일 생성: ${outPath}`);
  console.log("이 파일을 VPS로 복사한 뒤, 동일한 암호로 `npm run import-session`을 실행하세요.");
}

main();
