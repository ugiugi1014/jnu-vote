const jwt = require("jsonwebtoken");

// JWT 검증 미들웨어
// 인증이 필요한 API 앞에 붙여서 사용
// 사용법: router.get("/protected", verifyToken, (req, res) => { ... })
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "인증이 필요합니다." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { email, iat, exp }
    next();
  } catch (err) {
    return res.status(401).json({ error: "유효하지 않은 토큰입니다." });
  }
}

module.exports = verifyToken;
