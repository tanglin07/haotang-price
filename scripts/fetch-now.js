// scripts/fetch-now.js — 手動執行一次完整 pipeline（npm run fetch-now）
// 用於首次建立資料、測試，或排程異常時人工補抓
require("dotenv").config();
const { runPipeline } = require("../pipeline");
const cfg = require("../config.json");

(async () => {
  const result = await runPipeline(cfg, { isRetry: false, finalize: false });
  if (result.success) {
    console.log("\n[fetch-now] 成功，最新資料：");
    console.log(JSON.stringify(result.latest, null, 2));
  } else {
    console.error(`\n[fetch-now] 失敗，缺少來源：${(result.missing || []).join(", ")}`);
    process.exitCode = 1;
  }
})();
