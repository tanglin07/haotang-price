// scripts/build-static.js — 建置 GitHub Pages 靜態版（npm run build-static）
// 執行一次完整抓取計價，輸出 docs/：前端頁面 + prices-latest.json + quote.pdf
// GitHub Actions 每日排程執行本腳本後 commit docs/，Pages 即自動部署
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { runPipeline } = require("../pipeline");
const cfg = require("../config.json");
const { streamQuotePdf } = require("../lib/quote-pdf");
const jsonStore = require("../store/json");

(async () => {
  // finalize:true → 任一來源失敗時沿用前一日（data/prices-latest.json 有進版控）並標註
  const result = await runPipeline(cfg, { finalize: true });
  const latest = result.success ? result.latest : jsonStore.readLatest();
  if (!latest) {
    console.error("[build] 抓取失敗且無前日資料可沿用，建置中止");
    process.exit(1);
  }

  const root = path.join(__dirname, "..");
  const docs = path.join(root, "docs");

  // 複製前端 + 寫入資料檔
  fs.rmSync(docs, { recursive: true, force: true });
  fs.cpSync(path.join(root, "public"), docs, { recursive: true });
  fs.writeFileSync(path.join(docs, "prices-latest.json"), JSON.stringify(latest, null, 2), "utf-8");
  fs.writeFileSync(path.join(docs, ".nojekyll"), ""); // 停用 Pages 的 Jekyll 處理

  // 預先產生報價單 PDF（靜態站無伺服器可即時產生）
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(path.join(docs, "quote.pdf"));
    ws.on("finish", resolve);
    ws.on("error", reject);
    streamQuotePdf(latest, cfg.contact, ws);
  });

  console.log(`[build] docs/ 建置完成（${latest.fetchDate}，flags：${JSON.stringify(latest.flags || {})}）`);
})();
