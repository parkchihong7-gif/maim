import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const SALT_LEN = 16;
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;

/** AES-256-GCM으로 버퍼를 암호화한다. 출력 = salt(16) + iv(12) + authTag(16) + 암호문. */
export function encryptBuffer(plain: Buffer, passphrase: string): Buffer {
  const salt = crypto.randomBytes(SALT_LEN);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, encrypted]);
}

export function decryptBuffer(data: Buffer, passphrase: string): Buffer {
  const salt = data.subarray(0, SALT_LEN);
  const iv = data.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = data.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const encrypted = data.subarray(SALT_LEN + IV_LEN + AUTH_TAG_LEN);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
