const test = require("node:test");
const assert = require("node:assert");
const { parseOcrText, extractCertificateFields } = require("../src/services/ocrService");

test("코드블록으로 감싼 JSON 도 해석하고 문서번호를 정규화한다", () => {
  const r = parseOcrText('```json\n{"doc_no":"abcd-1234-efgh-5678","student_id":" 2022123 ","name":"홍길동"}\n```');
  assert.deepStrictEqual(r, { doc_no: "ABCD1234EFGH5678", student_id: "2022123", name: "홍길동" });
});

test("문서번호가 16자리가 아니면 빈 값", () => {
  assert.strictEqual(parseOcrText('{"doc_no":"123","student_id":"1"}').doc_no, "");
});

test("JSON 이 아니면 오류", () => {
  assert.throws(() => parseOcrText("모르겠어요"));
});

test("이미지가 아닌 파일은 외부 호출 전에 400", async () => {
  await assert.rejects(() => extractCertificateFields(Buffer.from("x"), "application/pdf"), (e) => e.status === 400);
});

test("Gemini 키는 URL 이 아니라 헤더로 보낸다", async () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  let seen;
  process.env.OCR_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "secret-key";
  global.fetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"doc_no":"AAAABBBBCCCCDDDD","student_id":"7"}' }] } }] }) };
  };
  try {
    const r = await extractCertificateFields(Buffer.from([1, 2, 3]), "image/png");
    assert.strictEqual(r.doc_no, "AAAABBBBCCCCDDDD");
    assert.ok(!String(seen.url).includes("secret-key"));
    assert.strictEqual(seen.init.headers["x-goog-api-key"], "secret-key");
  } finally {
    global.fetch = realFetch;
    process.env = saved;
  }
});
