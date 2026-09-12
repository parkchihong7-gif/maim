/**
 * export-session.ts로 내보낸 암호화 세션 파일을 복호화해 로컬 세션으로 반영한다.
 * VPS에서 실행하는 것을 전제로 한다.
 *
 * 사용법: npm run import-session -- <암호화파일경로> <passphrase>
 * (파일 경로 생략 시 data/naver-session.enc를 사용, 암호 생략 시 .env의 SESSION_EXPORT_PASSPHRASE 사용)
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.js";
import { decryptBuffer } from "../src/utils/crypto.js";

function main() {
  const inputPath = process.argv[2] || path.join(config.paths.dataDir, "naver-session.enc");
  if (!fs.existsSync(inputPath)) {
    console.error(`암호화된 세션 파일을 찾을 수 없습니다: ${inputPath}`);
    process.exit(1);
  }

  const passphrase = process.argv[3] || config.sessionExportPassphrase;
  if (!passphrase) {
    console.error(
      "암호가 필요합니다. .env의 SESSION_EXPORT_PASSPHRASE를 설정하거나 인자로 전달하세요:\n  npm run import-session -- <파일경로> <passphrase>",
    );
    process.exit(1);
  }

  const encrypted = fs.readFileSync(inputPath);
  let decrypted: Buffer;
  try {
    decrypted = decryptBuffer(encrypted, passphrase);
  } catch {
    console.error("복호화 실패 — 암호가 틀렸거나 파일이 손상되었습니다.");
    process.exit(1);
  }

  fs.writeFileSync(config.paths.naverSessionFile, decrypted);
  console.log(`세션 파일 복원 완료: ${config.paths.naverSessionFile}`);
}

main();
