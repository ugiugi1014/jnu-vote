// 재학증명서 OCR (서버 전용)
// 프론트가 Gemini 키를 들고 직접 호출하면 빌드된 번들에서 키가 그대로 노출되므로,
// 이미지는 서버로 보내고 서버가 키를 붙여 OCR 서비스를 호출한다.
//
// 환경변수
//   OCR_PROVIDER   gemini | ollama (기본 ollama)
//   GEMINI_API_KEY, GEMINI_MODEL (기본 gemini-2.0-flash)
//   OLLAMA_HOST, OLLAMA_MODEL

const PROMPT =
  '이 재학증명서 이미지에서 다음 정보만 JSON으로 추출해줘. 다른 말 없이 JSON만 반환해.\n' +
  '{\n' +
  '  "doc_no": "좌측 상단 진위확인 문서확인번호 16자리 영숫자 (하이픈 제거)",\n' +
  '  "student_id": "학번",\n' +
  '  "name": "이름"\n' +
  '}';

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function ocrError(message, status = 502) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// 모델 응답 텍스트 → { doc_no, student_id, name } (형식이 이상하면 빈 값)
function parseOcrText(text) {
  const clean = String(text || "").replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw ocrError("OCR 결과를 해석하지 못했습니다.");
  }
  const docNo = String(parsed.doc_no || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return {
    doc_no: docNo.length === 16 ? docNo : "",
    student_id: String(parsed.student_id || "").trim(),
    name: String(parsed.name || "").trim(),
  };
}

async function callGemini(base64, mimeType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw ocrError("GEMINI_API_KEY 가 설정되지 않았습니다.", 500);
  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
      }),
    }
  );
  if (!res.ok) throw ocrError(`Gemini 오류: ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callOllama(base64) {
  const host = process.env.OLLAMA_HOST;
  if (!host) throw ocrError("OLLAMA_HOST 가 설정되지 않았습니다.", 500);
  const res = await fetch(`${host.replace(/\/$/, "")}/api/generate?ngrok-skip-browser-warning=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OLLAMA_MODEL, prompt: PROMPT, images: [base64], stream: false }),
  });
  if (!res.ok) throw ocrError(`Ollama 오류: ${res.status}`);
  const data = await res.json();
  return data.response || "";
}

// buffer: 이미지 바이트, mimeType: image/*
async function extractCertificateFields(buffer, mimeType) {
  if (!ALLOWED_MIME.has(mimeType)) throw ocrError("이미지 파일(png, jpg, webp)만 OCR 할 수 있습니다.", 400);
  const base64 = Buffer.from(buffer).toString("base64");
  const provider = (process.env.OCR_PROVIDER || "ollama").toLowerCase();
  const text = provider === "gemini" ? await callGemini(base64, mimeType) : await callOllama(base64);
  return parseOcrText(text);
}

module.exports = { extractCertificateFields, parseOcrText, ALLOWED_MIME };
