// 데모 모드 공용 (DEMO_MODE=1). 데모 계정 목록은 DEMO_ACCOUNTS_FILE (demo/accounts.json) 하나에서 관리한다.
const fs = require("fs");

const DEMO_MODE = process.env.DEMO_MODE === "1";
let cached = null;

function loadDemoAccounts() {
  if (cached) return cached;
  const file = process.env.DEMO_ACCOUNTS_FILE;
  if (!DEMO_MODE || !file) return (cached = null);
  cached = JSON.parse(fs.readFileSync(file, "utf8"));
  return cached;
}

function demoEmails() {
  const a = loadDemoAccounts();
  if (!a) return [];
  return [a.admin?.email, ...(a.students || []).map((s) => s.email), a.outsider?.email]
    .filter(Boolean)
    .map((e) => e.toLowerCase());
}

const isDemoEmail = (email) => demoEmails().includes(String(email || "").toLowerCase());

module.exports = { DEMO_MODE, loadDemoAccounts, isDemoEmail };
