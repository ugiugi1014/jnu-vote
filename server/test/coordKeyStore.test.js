const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const { sealCoordKey, openCoordKey, PREFIX } = require("../src/services/coordKeyStore");

const KEY = crypto.randomBytes(32).toString("hex");
const SCALAR = "1234567890123456789012345678901234567890";

test("키가 있으면 암호화해서 저장하고 되돌릴 수 있다", () => {
  process.env.COORD_KEY_ENCRYPTION_KEY = KEY;
  const sealed = sealCoordKey(SCALAR);
  assert.ok(sealed.startsWith(PREFIX));
  assert.ok(!sealed.includes(SCALAR));
  assert.strictEqual(openCoordKey(sealed), SCALAR);
  assert.notStrictEqual(sealCoordKey(SCALAR), sealed);          // 매번 다른 IV
});

test("기존 평문 값은 그대로 읽힌다", () => {
  process.env.COORD_KEY_ENCRYPTION_KEY = KEY;
  assert.strictEqual(openCoordKey(SCALAR), SCALAR);
  assert.strictEqual(openCoordKey(null), null);
});

test("변조되거나 다른 키면 실패한다", () => {
  process.env.COORD_KEY_ENCRYPTION_KEY = KEY;
  const sealed = sealCoordKey(SCALAR);
  const buf = Buffer.from(sealed.slice(PREFIX.length), "base64");
  buf[buf.length - 1] ^= 1;
  assert.throws(() => openCoordKey(PREFIX + buf.toString("base64")));
  process.env.COORD_KEY_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  assert.throws(() => openCoordKey(sealed));
});

test("암호화된 값인데 키가 없으면 분명한 오류", () => {
  process.env.COORD_KEY_ENCRYPTION_KEY = KEY;
  const sealed = sealCoordKey(SCALAR);
  delete process.env.COORD_KEY_ENCRYPTION_KEY;
  assert.throws(() => openCoordKey(sealed), /COORD_KEY_ENCRYPTION_KEY/);
});
