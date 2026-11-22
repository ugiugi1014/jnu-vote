// 코디네이터 개인키 저장 시 암호화 (AES-256-GCM)
// DB 가 유출돼도 키 없이는 진행 중인 선거의 표를 풀 수 없게 한다.
//
// 환경변수 COORD_KEY_ENCRYPTION_KEY : 32바이트 키 (64자리 hex 또는 base64)
//   생성 예: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//   ※ 이 키를 잃으면 진행 중인 선거를 개표할 수 없다. 서버 .env 와 별도로 백업할 것.
// 키가 없으면 경고 후 평문 저장(개발용). 기존 평문 값도 그대로 읽힌다(접두어로 구분).

const crypto = require("crypto");
const PREFIX = "enc:v1:";

let warned = false;

function getKey() {
  const raw = process.env.COORD_KEY_ENCRYPTION_KEY;
  if (!raw) return null;
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("COORD_KEY_ENCRYPTION_KEY 는 32바이트(64자리 hex 또는 base64)여야 합니다.");
  return buf;
}

function sealCoordKey(plain) {
  const key = getKey();
  if (!key) {
    if (!warned) {
      console.warn("[coordKeyStore] COORD_KEY_ENCRYPTION_KEY 없음 — 코디네이터 개인키를 평문으로 저장합니다 (개발용).");
      warned = true;
    }
    return String(plain);
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

function openCoordKey(stored) {
  if (stored == null) return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s; // 기존 평문 값
  const key = getKey();
  if (!key) throw new Error("코디네이터 개인키가 암호화돼 있지만 COORD_KEY_ENCRYPTION_KEY 가 없습니다.");
  const buf = Buffer.from(s.slice(PREFIX.length), "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

module.exports = { sealCoordKey, openCoordKey, PREFIX };
