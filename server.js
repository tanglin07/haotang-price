// server.js — Express 入口：提供靜態報價頁 + /api/prices，並啟動每日排程
require("dotenv").config();
const express = require("express");
const path = require("path");
const cfg = require("./config.json");
const jsonStore = require("./store/json");
const { startScheduler } = require("./scheduler");
const { runPipeline } = require("./pipeline");
const { streamQuotePdf } = require("./lib/quote-pdf");

const app = express();

// 靜態前端（繁中報價表）
app.use(express.static(path.join(__dirname, "public")));

// 報價 API：直接回傳 prices-latest.json 內容
app.get("/api/prices", (req, res) => {
  const latest = jsonStore.readLatest();
  if (!latest) {
    return res.status(503).json({ error: "尚無報價資料，請稍後再試" });
  }
  res.json(latest);
});

// 手動更新價格：立即重跑一次完整抓取（60 秒節流，避免連點打爆來源網站）
// 一律以 isRetry:true 執行，LME 走 Westmetall，保護 metals.dev 月額度
let lastManualRefresh = 0;
app.post("/api/refresh", async (req, res) => {
  const now = Date.now();
  if (now - lastManualRefresh < 60 * 1000) {
    return res.status(429).json({ error: "更新太頻繁，請稍候一分鐘再試" });
  }
  lastManualRefresh = now;
  try {
    // 清掉當日暫存，強制全部來源重新抓取
    jsonStore.clearPartial();
    const result = await runPipeline(cfg, { isRetry: true });
    if (result.success) return res.json(result.latest);
    return res.status(502).json({
      error: `部分來源抓取失敗（${(result.missing || []).join("、")}），價格未更新`
    });
  } catch (e) {
    console.error("[server] 手動更新失敗：", e.message);
    res.status(500).json({ error: "更新失敗：" + e.message });
  }
});

// 下載簡易報價單 PDF（品名 + 報價 + 聯絡方式）
app.get("/api/quote.pdf", (req, res) => {
  const latest = jsonStore.readLatest();
  if (!latest) return res.status(503).json({ error: "尚無報價資料" });
  const filename = `haotang-quote-${latest.fetchDate}.pdf`;
  const utf8Name = encodeURIComponent(`浩堂報價單-${latest.fetchDate}.pdf`);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${utf8Name}`);
  streamQuotePdf(latest, cfg.contact, res);
});

const port = process.env.PORT || cfg.server.port;
app.listen(port, () => {
  console.log(`[server] 浩堂報價網站啟動：http://localhost:${port}`);
  // 啟動排程（每日 07:00 抓取 + 失敗重試 + 23:00 收尾）
  startScheduler(cfg);
});
