// 메모리 기반 요청 횟수 제한 (외부 의존성 없음)
// - 키(기본: IP)별로 windowMs 동안 max 회까지 허용, 넘으면 429
// - 익명 투표 가정(서버가 요청 IP 를 기록하지 않는다)과 맞추기 위해
//   IP 를 로그·DB 에 남기지 않고, 창이 지나면 메모리에서도 지운다.
// - 서버가 여러 대면 인스턴스별로 따로 센다 (캡스톤 규모에서는 충분).
// - 프록시 뒤에 있으면 index.js 의 TRUST_PROXY 를 설정해야 req.ip 가 실제 클라이언트가 된다.

function createRateLimiter({ windowMs, max, keyFn = (req) => req.ip, message = "요청이 너무 많습니다. 잠시 후 다시 시도하세요.", now = () => Date.now() }) {
  const hits = new Map(); // key -> { count, resetAt }

  function sweep(t) {
    for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
  }

  function limiter(req, res, next) {
    const t = now();
    if (hits.size > 10000) sweep(t);
    const key = String(keyFn(req) || "unknown");
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= t) {
      entry = { count: 0, resetAt: t + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.set("Retry-After", String(Math.ceil((entry.resetAt - t) / 1000)));
      return res.status(429).json({ message });
    }
    next();
  }
  limiter._hits = hits; // 테스트용
  return limiter;
}

module.exports = { createRateLimiter };
