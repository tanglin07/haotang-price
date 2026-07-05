// fetchers/baotai.js — 寶泰集團生铝屑「今日价格」（人民幣元/噸）
// 首選：直接抓取寶泰網頁（UTF-8、非 JS 動態載入，axios + cheerio 即可）
// 備援：data/manual-baotai.json 人工輸入（中國站點可能偶發封鎖）
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const MANUAL_FILE = path.join(__dirname, "..", "data", "manual-baotai.json");

async function fetchBaotaiFromWeb() {
  const url = "https://www.baotaigroup.com.cn/index/offer/hoffer/id/97.html";
  const { data: html } = await axios.get(url, {
    timeout: 20000,
    responseType: "text",
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "zh-CN" }
  });
  const $ = cheerio.load(html);
  // 頁面結構（實測 2026-07-05）：實際顯示的價格列為 div.box_data，
  // 內含 p.box_item1（日期）、box_item2（说明）、box_item3（今日价格）、box_item4（昨日价格）…
  // 注意：頁面另有一份包在 HTML 註解裡的舊版 li/span 結構，cheerio 會自動忽略註解
  let today = null;
  let dateTxt = null;
  const tryRow = (d, priceTxt) => {
    if (today) return;
    const price = (priceTxt || "").replace(/[^\d.]/g, "");
    if (/\d{4}-\d{2}-\d{2}/.test(d || "") && price) {
      dateTxt = d.match(/\d{4}-\d{2}-\d{2}/)[0];
      today = Number(price);
    }
  };
  // 主要結構：div.box_data（第一列即最新日期）
  $(".box_data").each((_, row) => {
    tryRow($(row).find(".box_item1").first().text().trim(), $(row).find(".box_item3").first().text().trim());
  });
  // 備援 1：舊版 li/span 結構（日期|说明|今日价格|…）
  if (!today) {
    $("li").each((_, li) => {
      const spans = $(li).find("span").map((_, s) => $(s).text().trim()).get();
      if (spans.length >= 4) tryRow(spans[0], spans[2]);
    });
  }
  // 備援 2：表格 tr/td 結構
  if (!today) {
    $("tr").each((_, tr) => {
      const tds = $(tr).find("td").map((_, td) => $(td).text().trim()).get();
      if (tds.length >= 4) tryRow(tds[0], tds[2]);
    });
  }
  if (!today) throw new Error("寶泰今日价格解析失敗");
  return { value: today, date: dateTxt, source: "baotai", unit: "CNY/t" };
}

// 人工輸入備援：讀 data/manual-baotai.json { "value": 19200, "date": "2026-07-04" }
function readManualBaotai() {
  if (!fs.existsSync(MANUAL_FILE)) throw new Error("無人工輸入檔 manual-baotai.json");
  const data = JSON.parse(fs.readFileSync(MANUAL_FILE, "utf-8"));
  if (!data.value || Number.isNaN(Number(data.value))) {
    throw new Error("manual-baotai.json 無有效 value");
  }
  return {
    value: Number(data.value),
    date: data.date || null,
    source: "manual",
    unit: "CNY/t"
  };
}

// 對外介面：網頁抓取失敗 → 讀人工輸入檔
async function fetchBaotai() {
  try {
    return await fetchBaotaiFromWeb();
  } catch (e) {
    console.warn("[寶泰] 網頁抓取失敗，改讀人工輸入：", e.message);
    return readManualBaotai();
  }
}

module.exports = { fetchBaotai, fetchBaotaiFromWeb, readManualBaotai };
