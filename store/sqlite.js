// store/sqlite.js — data/history.sqlite 每日一列歷史（走勢圖、稽核、波動比較用）
const path = require("path");
const Database = require("better-sqlite3");

const DB_FILE = path.join(__dirname, "..", "data", "history.sqlite");

let db = null;

function getDb() {
  if (db) return db;
  db = new Database(DB_FILE);
  // 每日一列：date 為主鍵，重複寫入同日即覆蓋（upsert）
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      date        TEXT PRIMARY KEY,   -- 台灣日期 YYYY-MM-DD
      lme         REAL,               -- LME 3M 鋁價 USD/t
      usd         REAL,               -- USD/TWD 即期賣出
      cny         REAL,               -- CNY/TWD 即期賣出
      baotai      REAL,               -- 寶泰今日价格 CNY/t
      items_json  TEXT,               -- 五品項收購/報價 JSON
      sources_json TEXT,              -- 各來源 JSON
      flags_json  TEXT,               -- 沿用前日等標註 JSON
      updated_at  TEXT                -- 寫入時間 ISO 字串
    )
  `);
  return db;
}

// 寫入（或覆蓋）當日歷史列
function saveDay(latest) {
  const d = getDb();
  d.prepare(`
    INSERT INTO history (date, lme, usd, cny, baotai, items_json, sources_json, flags_json, updated_at)
    VALUES (@date, @lme, @usd, @cny, @baotai, @items, @sources, @flags, @updatedAt)
    ON CONFLICT(date) DO UPDATE SET
      lme=@lme, usd=@usd, cny=@cny, baotai=@baotai,
      items_json=@items, sources_json=@sources, flags_json=@flags, updated_at=@updatedAt
  `).run({
    date: latest.fetchDate,
    lme: latest.inputs.lme,
    usd: latest.inputs.usd,
    cny: latest.inputs.cny,
    baotai: latest.inputs.baotai,
    items: JSON.stringify(latest.items),
    sources: JSON.stringify(latest.sources),
    flags: JSON.stringify(latest.flags || {}),
    updatedAt: latest.updatedAt
  });
}

// 讀取最近 n 天歷史（新到舊）
function recentDays(n = 30) {
  return getDb()
    .prepare("SELECT * FROM history ORDER BY date DESC LIMIT ?")
    .all(n);
}

module.exports = { saveDay, recentDays };
