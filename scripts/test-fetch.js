// scripts/test-fetch.js — 一次性驗證三個資料來源都抓得到值（npm run test-fetch）
// 特別驗證：台銀 CSV 編碼與「即期賣出」欄位位置、Westmetall 第 3 欄、寶泰「今日价格」
require("dotenv").config();
const axios = require("axios");
const iconv = require("iconv-lite");

const { fetchLmeFromWestmetall, fetchLmeFromMetalsDev } = require("../fetchers/lme");
const { fetchFxFromCsv, fetchFxFromHtml } = require("../fetchers/fxrate");
const { fetchBaotaiFromWeb } = require("../fetchers/baotai");
const cfg = require("../config.json");

async function main() {
  console.log("========== 浩堂報價來源驗證 ==========\n");

  // --- 1. LME 3M 鋁價 ---
  console.log("【1】LME 3M 鋁價");
  try {
    const r = await fetchLmeFromWestmetall();
    console.log(`  Westmetall：${r.value} ${r.unit}（資料日期 ${r.date}）`);
  } catch (e) {
    console.error("  ✗ Westmetall 失敗：", e.message);
  }
  if (process.env.METALS_DEV_KEY) {
    try {
      const r = await fetchLmeFromMetalsDev(process.env.METALS_DEV_KEY);
      console.log(`  metals.dev：${r.value} ${r.unit}`);
    } catch (e) {
      console.error("  ✗ metals.dev 失敗：", e.message);
    }
  } else {
    console.log("  （未設定 METALS_DEV_KEY，略過 metals.dev）");
  }

  // --- 2. 台銀匯率：先印出 CSV 原始前 3 列，驗證編碼與欄位順序 ---
  console.log("\n【2】台銀匯率（口徑：" + cfg.fx.rate_type + "）");
  try {
    const resp = await axios.get("https://rate.bot.com.tw/xrt/flcsv/0/day", {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });
    const buf = Buffer.from(resp.data);
    // 實測 2026-07-05：UTF-8 帶 BOM；保留 Big5 判斷以防日後改版
    let text;
    let enc;
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      text = buf.slice(3).toString("utf-8");
      enc = "utf-8 (BOM)";
    } else if (buf.toString("utf-8").includes("本行")) {
      text = buf.toString("utf-8");
      enc = "utf-8";
    } else {
      text = iconv.decode(buf, "big5");
      enc = "big5";
    }
    console.log(`  CSV 編碼判定：${enc}，原始前 3 列：`);
    text.split(/\r?\n/).slice(0, 3).forEach((l, i) => console.log(`    [${i}] ${l}`));
    const usdRow = text.split(/\r?\n/).find((l) => l.startsWith("USD"));
    const cnyRow = text.split(/\r?\n/).find((l) => l.startsWith("CNY"));
    if (usdRow) console.log(`    [USD 列] ${usdRow}`);
    if (cnyRow) console.log(`    [CNY 列] ${cnyRow}`);
  } catch (e) {
    console.error("  ✗ CSV 原始內容讀取失敗：", e.message);
  }
  try {
    const r = await fetchFxFromCsv(cfg.fx.rate_type);
    console.log(`  CSV 解析結果：USD=${r.usd}、CNY=${r.cny}（${r.rateType}）`);
  } catch (e) {
    console.error("  ✗ CSV 解析失敗：", e.message);
  }
  try {
    const r = await fetchFxFromHtml(cfg.fx.rate_type);
    console.log(`  HTML 備援結果：USD=${r.usd}、CNY=${r.cny}（${r.rateType}）`);
  } catch (e) {
    console.error("  ✗ HTML 備援失敗：", e.message);
  }

  // --- 3. 寶泰生鋁屑 ---
  console.log("\n【3】寶泰生鋁屑");
  try {
    const r = await fetchBaotaiFromWeb();
    console.log(`  今日价格：${r.value} ${r.unit}（資料日期 ${r.date}）`);
  } catch (e) {
    console.error("  ✗ 寶泰失敗（正式環境將改讀 manual-baotai.json）：", e.message);
  }

  console.log("\n========== 驗證結束 ==========");
}

main();
