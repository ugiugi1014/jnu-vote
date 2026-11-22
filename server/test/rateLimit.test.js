const test = require("node:test");
const assert = require("node:assert");
const { createRateLimiter } = require("../src/middleware/rateLimit");

function fakeRes() {
  return {
    code: 200, headers: {}, body: null,
    status(c) { this.code = c; return this; },
    set(k, v) { this.headers[k] = v; return this; },
    json(b) { this.body = b; return this; },
  };
}

test("창 안에서 max 회까지 통과, 넘으면 429, 창이 지나면 다시 통과", () => {
  let t = 1000;
  const lim = createRateLimiter({ windowMs: 60_000, max: 3, now: () => t });
  const req = { ip: "1.2.3.4" };
  let passed = 0;
  for (let i = 0; i < 3; i++) lim(req, fakeRes(), () => passed++);
  assert.strictEqual(passed, 3);
  const r = fakeRes();
  lim(req, r, () => passed++);
  assert.strictEqual(r.code, 429);
  assert.strictEqual(passed, 3);
  lim({ ip: "5.6.7.8" }, fakeRes(), () => passed++);        // 다른 IP 는 따로 센다
  assert.strictEqual(passed, 4);
  t += 60_001;
  lim(req, fakeRes(), () => passed++);
  assert.strictEqual(passed, 5);
});
