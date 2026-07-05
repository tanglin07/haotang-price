// store/json.js — 讀寫 data/prices-latest.json（當前顯示用）與 partial-today.json（部分成功暫存）
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const LATEST_FILE = path.join(DATA_DIR, "prices-latest.json");
const PARTIAL_FILE = path.join(DATA_DIR, "partial-today.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 讀取當前顯示資料（無檔案時回傳 null）
function readLatest() {
  if (!fs.existsSync(LATEST_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(LATEST_FILE, "utf-8"));
  } catch {
    return null;
  }
}

// 寫入當前顯示資料
function writeLatest(data) {
  ensureDataDir();
  fs.writeFileSync(LATEST_FILE, JSON.stringify(data, null, 2), "utf-8");
}

// 讀取當日部分成功暫存（重試時只補抓失敗來源用）
// 格式：{ date: "2026-07-05", inputs: {...}, sources: {...} }
function readPartial(todayStr) {
  if (!fs.existsSync(PARTIAL_FILE)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(PARTIAL_FILE, "utf-8"));
    // 只採用「今天」的暫存，跨日即作廢
    return data.date === todayStr ? data : null;
  } catch {
    return null;
  }
}

function writePartial(data) {
  ensureDataDir();
  fs.writeFileSync(PARTIAL_FILE, JSON.stringify(data, null, 2), "utf-8");
}

function clearPartial() {
  if (fs.existsSync(PARTIAL_FILE)) fs.unlinkSync(PARTIAL_FILE);
}

module.exports = { readLatest, writeLatest, readPartial, writePartial, clearPartial, LATEST_FILE };
