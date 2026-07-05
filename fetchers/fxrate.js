// fetchers/fxrate.js — 台灣銀行匯率（USD 與 CNY）
// 口徑：「即期賣出」（浩堂 2026-07-05 確認，config.fx.rate_type = spot_sell）
// 首選：台銀 CSV 端點 /xrt/flcsv/0/day → 備援：台銀 HTML 牌告頁
const axios = require("axios");
const iconv = require("iconv-lite"); // 台銀 flcsv 常為 Big5，需轉碼
const cheerio = require("cheerio");

// 解碼 CSV：實測 2026-07-05 台銀 flcsv 為 UTF-8（帶 BOM）；保留 Big5 備援以防日後改版
// 判斷依據：正確解碼後必含「本行買入/本行賣出」字樣
function decodeCsv(buf) {
  // UTF-8 BOM（EF BB BF）→ 直接以 UTF-8 解碼
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString("utf-8");
  }
  const utf8 = buf.toString("utf-8");
  if (utf8.includes("本行")) return utf8;
  const big5 = iconv.decode(buf, "big5");
  if (big5.includes("本行")) return big5;
  throw new Error("CSV 編碼無法辨識（UTF-8/Big5 皆無「本行」字樣）");
}

// 解析單一幣別列，回傳 { spotBuy, spotSell }
// 台銀 CSV 每列格式（實測 2026-07-05 驗證）：
//   幣別,匯率,現金,即期,遠期10天,...,遠期180天,匯率,現金,即期,遠期10天,...,遠期180天
//   USD,本行買入,現金買入,即期買入,遠期...,本行賣出,現金賣出,即期賣出,遠期...
// 以「本行買入」「本行賣出」文字標記定位：即期 = 標記後第 2 欄（+1 現金、+2 即期）
// 注意：不可用固定欄位 index 備援——idx4 實為「遠期10天」而非即期賣出，抓錯會上錯價；
//       標記找不到時直接丟錯，讓上層改走台銀 HTML 備援
function parseCurrencyRow(cells) {
  const buyIdx = cells.findIndex((c) => c.includes("本行買入"));
  const sellIdx = cells.findIndex((c) => c.includes("本行賣出"));
  if (buyIdx >= 0 && sellIdx >= 0) {
    const spotBuy = Number(cells[buyIdx + 2]);
    const spotSell = Number(cells[sellIdx + 2]);
    if (spotBuy > 0 && spotSell > 0) return { spotBuy, spotSell };
  }
  throw new Error("欄位解析失敗（找不到本行買入/賣出標記或即期值非正數）");
}

// 首選：台銀 CSV 端點
async function fetchFxFromCsv(rateType) {
  const url = "https://rate.bot.com.tw/xrt/flcsv/0/day";
  // 注意：無 User-Agent 時台銀會回傳反爬蟲挑戰頁（實測 2026-07-05），必須帶 UA
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  const buf = Buffer.from(resp.data);
  const text = decodeCsv(buf);
  const rows = text.split(/\r?\n/).map((r) => r.split(",").map((c) => c.trim()));
  const pick = (code) => {
    const row = rows.find((r) => (r[0] || "").toUpperCase().includes(code));
    if (!row) throw new Error(`CSV 找不到 ${code} 列`);
    const { spotBuy, spotSell } = parseCurrencyRow(row);
    return rateType === "spot_buy" ? spotBuy : spotSell;
  };
  return { usd: pick("USD"), cny: pick("CNY"), source: "bot-csv", rateType };
}

// 備援：台銀 HTML 牌告頁
async function fetchFxFromHtml(rateType) {
  const url = "https://rate.bot.com.tw/xrt?Lang=zh-TW";
  const { data: html } = await axios.get(url, {
    timeout: 15000,
    headers: { "User-Agent": "Mozilla/5.0" }
  });
  const $ = cheerio.load(html);
  const readRow = (label) => {
    let val = null;
    $("table tbody tr").each((_, tr) => {
      if (val) return;
      const name = $(tr).find("td").first().text();
      if (name.includes(label)) {
        // 即期欄位 class 為 rate-content-sight：第 1 個為即期買入、第 2 個為即期賣出
        const cells = $(tr).find("td.rate-content-sight");
        if (cells.length >= 2) {
          const idx = rateType === "spot_buy" ? 0 : 1;
          val = Number($(cells[idx]).text().trim());
        }
      }
    });
    if (!val) throw new Error(`HTML 找不到 ${label} 即期匯率`);
    return val;
  };
  return { usd: readRow("美金"), cny: readRow("人民幣"), source: "bot-html", rateType };
}

// 對外介面：CSV 失敗自動改走 HTML
async function fetchFx(rateType = "spot_sell") {
  try {
    return await fetchFxFromCsv(rateType);
  } catch (e) {
    console.warn("[FX] CSV 失敗，改用 HTML：", e.message);
    return await fetchFxFromHtml(rateType);
  }
}

module.exports = { fetchFx, fetchFxFromCsv, fetchFxFromHtml };
