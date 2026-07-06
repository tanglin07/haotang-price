// fetchers/lme.js — 抓取 LME 3-Month 鋁價（美元/公噸）
// 來源策略（浩堂 2026-07-05 確認，尚無 metals.dev key）：
//   - 預設以 Westmetall 網頁表格為主來源（免費無限、無需 key）
//   - 若 .env 有 METALS_DEV_KEY，首抓改以 metals.dev 為首選、Westmetall 為備援
//   - 每小時重試階段一律直接走 Westmetall，保護 metals.dev 每月 100 次額度
const axios = require("axios");
const cheerio = require("cheerio");

// metals.dev：欄位 lme_aluminum，單位已是美元/公噸，無需換算
async function fetchLmeFromMetalsDev(apiKey) {
  const url = `https://api.metals.dev/v1/metal/authority?authority=lme&api_key=${apiKey}&currency=USD`;
  const { data } = await axios.get(url, { timeout: 15000 });
  if (data.status !== "success") throw new Error("metals.dev 回傳非 success");
  // lme_aluminum 為 LME Aluminum 3M，單位公噸(mt)
  const price = data.rates && data.rates.lme_aluminum;
  if (!price) throw new Error("metals.dev 無 lme_aluminum 欄位");
  return { value: Number(price), source: "metals.dev", unit: "USD/t" };
}

// Westmetall：表格欄位依序為 日期 | Cash-Settlement | 3-month | stock
// 取第一個「第一欄像日期、第三欄為數字」的資料列，第 3 欄即為 3-month 價格
// 逾時 30 秒 + 失敗重試一次（實測 GitHub Actions 主機連 Westmetall 偶發 15 秒逾時）
async function fetchLmeFromWestmetall(attempt = 1) {
  const url = "https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash";
  let html;
  try {
    ({ data: html } = await axios.get(url, {
      timeout: 30000,
      headers: { "User-Agent": "Mozilla/5.0" }
    }));
  } catch (e) {
    if (attempt < 2) {
      console.warn(`[LME] Westmetall 第 ${attempt} 次失敗（${e.message}），重試中`);
      return fetchLmeFromWestmetall(attempt + 1);
    }
    throw e;
  }
  const $ = cheerio.load(html);
  let value = null;
  let dateTxt = null;
  $("table tr").each((_, tr) => {
    if (value) return;
    const tds = $(tr).find("td");
    if (tds.length >= 3) {
      const d = $(tds[0]).text().trim();
      const threeMonth = $(tds[2]).text().trim().replace(/,/g, "");
      // 第一欄需含年份（像日期）、第三欄需為純數字才採用
      if (/\d{4}/.test(d) && /^\d+(\.\d+)?$/.test(threeMonth)) {
        dateTxt = d;
        value = Number(threeMonth);
      }
    }
  });
  if (!value) throw new Error("Westmetall 解析失敗（找不到 3-month 數值列）");
  return { value, date: dateTxt, source: "westmetall", unit: "USD/t" };
}

// Jina Reader 代理備援：Westmetall 會擋雲端機房 IP（實測 GitHub Actions 直連必逾時），
// 透過 r.jina.ai 中轉取得頁面文字版，再解析表格第一列的三個數字（cash | 3-month | stock）
async function fetchLmeFromWestmetallViaJina() {
  const url = "https://r.jina.ai/https://www.westmetall.com/en/markdaten.php?action=table&field=LME_Al_cash";
  const { data: text } = await axios.get(url, {
    timeout: 60000,
    responseType: "text",
    headers: { "User-Agent": "Mozilla/5.0", "X-Return-Format": "markdown" }
  });
  // Markdown 表格列格式：| 03. July 2026 | 3,080.00 | 3,087.00 | 298,775 |
  // 欄序與原網頁相同：日期 | cash | 3-month | stock → 取日期欄後第 2 欄
  // 注意：不可對整行抓數字（日期中的年份會被誤認為價格），必須按 | 分欄
  const dateRe = /\d{1,2}\.\s*[A-Za-z]+\s*\d{4}/;
  for (const line of String(text).split(/\r?\n/)) {
    if (!dateRe.test(line) || !line.includes("|")) continue;
    const cells = line.split("|").map((c) => c.trim()).filter((c) => c !== "");
    const dateIdx = cells.findIndex((c) => dateRe.test(c));
    if (dateIdx < 0 || cells.length < dateIdx + 3) continue;
    const threeMonth = Number(cells[dateIdx + 2].replace(/,/g, ""));
    if (Number.isFinite(threeMonth) && threeMonth > 0) {
      return { value: threeMonth, date: cells[dateIdx], source: "westmetall-jina", unit: "USD/t" };
    }
  }
  throw new Error("Jina 代理內容解析失敗（找不到資料列）");
}

// 對外介面：依有無 API key 與是否重試階段決定來源順序
// 順序：metals.dev（有 key 且非重試）→ Westmetall 直連（重試 1 次）→ Jina 代理
async function fetchLme({ isRetry = false } = {}) {
  const apiKey = process.env.METALS_DEV_KEY;
  // 有 key 且非重試階段 → metals.dev 首選
  if (apiKey && !isRetry) {
    try {
      return await fetchLmeFromMetalsDev(apiKey);
    } catch (e) {
      console.warn("[LME] metals.dev 失敗，改用 Westmetall：", e.message);
    }
  }
  try {
    return await fetchLmeFromWestmetall();
  } catch (e) {
    console.warn("[LME] Westmetall 直連失敗，改走 Jina 代理：", e.message);
    return await fetchLmeFromWestmetallViaJina();
  }
}

module.exports = {
  fetchLme,
  fetchLmeFromWestmetall,
  fetchLmeFromMetalsDev,
  fetchLmeFromWestmetallViaJina
};
