// scripts/verify-engine.js — 計價引擎對照驗證（npm run verify-engine）
// 以規格書 J 節試算表的固定輸入驗證五條公式實作正確（同輸入必得同結果）
const { computePrices } = require("../pricing/engine");
const cfg = require("../config.json");

let ok = true;

// 規格書 J 節：LME=3087、USD=31.785、CNY=4.66、寶泰=19200
const expected = { "鋁骨": 93.21, "濁鋁骨": 78.3, "6頭鋁屑": 63.78, "混合鋁屑": 56.91, "生鋁屑": 60.88 };
const items = computePrices({ lme: 3087, usd: 31.785, cny: 4.66, baotai: 19200 }, cfg.params);
for (const it of items) {
  const exp = expected[it.name];
  const pass = Math.abs(it.buy - exp) < 0.005 && Math.abs(it.quote - (exp - cfg.params.quote_deduct)) < 0.005;
  if (!pass) ok = false;
  console.log(`${it.name}: 收購=${it.buy} 報價=${it.quote}（預期 ${exp}/${(exp - cfg.params.quote_deduct).toFixed(2)}）${pass ? "PASS" : "FAIL"}`);
}

// 浩堂確認案例（2026-07-05）：CNY 即期賣出 4.74 → 生鋁屑 = 62.11
const items2 = computePrices({ lme: 3087, usd: 31.785, cny: 4.74, baotai: 19200 }, cfg.params);
const rawAlu = items2.find((i) => i.name === "生鋁屑");
const pass2 = Math.abs(rawAlu.buy - 62.11) < 0.005;
if (!pass2) ok = false;
console.log(`生鋁屑（CNY=4.74）: 收購=${rawAlu.buy}（預期 62.11）${pass2 ? "PASS" : "FAIL"}`);

console.log(ok ? "=== 全部通過 ===" : "=== 有失敗 ===");
process.exitCode = ok ? 0 : 1;
