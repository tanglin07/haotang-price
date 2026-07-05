// lib/quote-pdf.js — 產生簡易報價單 PDF（A4，品名 + 報價 元/kg + 聯絡方式）
// 中文字型使用專案內建思源黑體（fonts/NotoSansCJKtc-Regular.otf，SIL OFL 可商用），
// 部署到任何主機都能產生相同結果，不依賴系統字型
const PDFDocument = require("pdfkit");
const path = require("path");

const FONT_PATH = path.join(__dirname, "..", "fonts", "NotoSansCJKtc-Regular.otf");

// 色票與網頁一致
const INK = "#1c2126";
const STEEL = "#66727c";
const FAINT = "#97a2ab";
const LINE = "#e9edf0";
const ACCENT = "#e07a24";

/**
 * 將報價單 PDF 串流寫入 res（或任何 writable stream）
 * @param {object} latest prices-latest.json 內容
 * @param {object} contact config.contact（label 與 phones）
 * @param {Stream} stream 輸出目標（HTTP response）
 */
function streamQuotePdf(latest, contact, stream) {
  const doc = new PDFDocument({ size: "A4", margin: 56 });
  doc.pipe(stream);
  doc.registerFont("tc", FONT_PATH);
  doc.font("tc");

  const left = 56;
  const right = 539; // A4 595pt − 右邊界 56

  // ── 頁首：品牌 + 日期 ──
  doc.rect(left, 62, 11, 11).fill(ACCENT);
  doc.fillColor(INK).fontSize(24).text("浩堂", left + 20, 50);
  doc.fillColor(STEEL).fontSize(12).text("廢鋁報價單", left + 20, 84);
  doc.fillColor(STEEL).fontSize(10)
    .text(`報價日期：${latest.fetchDate}`, left, 58, { width: right - left, align: "right" });

  // 頁首分隔線
  doc.moveTo(left, 116).lineTo(right, 116).lineWidth(1.2).strokeColor(INK).stroke();

  // ── 報價表：品名 | 報價（元/kg） ──
  let y = 134;
  doc.fillColor(FAINT).fontSize(10);
  doc.text("品名", left, y);
  doc.text("報價（元/kg）", left, y, { width: right - left, align: "right" });
  y += 22;
  doc.moveTo(left, y - 6).lineTo(right, y - 6).lineWidth(0.8).strokeColor(LINE).stroke();

  let hasStale = false;
  for (const item of latest.items) {
    const stale = !!item.flag;
    if (stale) hasStale = true;
    doc.fillColor(INK).fontSize(14).text(item.name + (stale ? " ⚠" : ""), left, y + 8);
    doc.fillColor(INK).fontSize(17)
      .text(item.quote.toFixed(2), left, y + 6, { width: right - left, align: "right" });
    y += 40;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).strokeColor(LINE).stroke();
  }

  // 沿用前日註記
  if (hasStale) {
    y += 12;
    doc.fillColor(FAINT).fontSize(9).text("⚠ 表示該品項為前日參考價。", left, y);
    y += 8;
  }

  // ── 聯絡方式 ──
  y += 28;
  doc.rect(left, y, right - left, 56).fillAndStroke("#f7f8f9", LINE);
  doc.fillColor(FAINT).fontSize(9).text("聯 絡 我 們", left + 18, y + 10);
  doc.fillColor(INK).fontSize(13)
    .text(`${contact.label}：${contact.phones.join("　")}`, left + 18, y + 26);

  // ── 頁尾免責（y 需留足兩行高度，超過底邊界 786 會被 pdfkit 自動換到第 2 頁） ──
  doc.fillColor(FAINT).fontSize(8.5).text(
    "本報價單價格僅供參考，實際收購價以現場過磅與當日確認為準。\n價格依 LME 國際鋁價、匯率及市場行情每日變動。",
    left, 742, { width: right - left, align: "center", lineGap: 3 }
  );

  doc.end();
}

module.exports = { streamQuotePdf };
