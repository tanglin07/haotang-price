// pipeline.js — 串接：抓取 → 合理區間驗證 → 計價 → 波動警示 → 儲存
// 部分失敗處理：已成功的來源寫入 partial-today.json 暫存，重試時只補抓失敗來源
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const { fetchLme } = require("./fetchers/lme");
const { fetchFx } = require("./fetchers/fxrate");
const { fetchBaotai } = require("./fetchers/baotai");
const { computePrices } = require("./pricing/engine");
const { inRange, checkDailyChange, fallbackToPrevious } = require("./pricing/guards");
const jsonStore = require("./store/json");
const sqliteStore = require("./store/sqlite");

// 取得台灣時區的今天日期字串
function taipeiToday(tzName) {
  return dayjs().tz(tzName).format("YYYY-MM-DD");
}

/**
 * 執行一次完整抓取與計價流程
 * @param {object} cfg config.json 內容
 * @param {object} opts { isRetry: 是否為每小時重試階段, finalize: 是否為 23:00 收尾（缺值沿用前日強制產出） }
 * @returns {object} { success, latest, missing }
 */
async function runPipeline(cfg, { isRetry = false, finalize = false } = {}) {
  const t = cfg.thresholds;
  const today = taipeiToday(cfg.schedule.timezone);
  const previous = jsonStore.readLatest(); // 前一次成功資料（波動比較與沿用前日用）

  // 讀取當日暫存（只補抓失敗來源）
  const partial = jsonStore.readPartial(today) || { date: today, inputs: {}, sources: {} };
  const inputs = partial.inputs;
  const sources = partial.sources;

  // --- 抓取 LME（含第一道防呆：合理區間） ---
  if (inputs.lme == null) {
    try {
      const r = await fetchLme({ isRetry });
      inRange("LME", r.value, t.lme_min, t.lme_max);
      inputs.lme = r.value;
      sources.lme = r.source;
    } catch (e) {
      console.error("[pipeline] LME 抓取失敗：", e.message);
    }
  }

  // --- 抓取匯率（USD 與 CNY 同一來源，口徑依 config.fx.rate_type） ---
  if (inputs.usd == null || inputs.cny == null) {
    try {
      const r = await fetchFx(cfg.fx.rate_type);
      inRange("USD/TWD", r.usd, t.usd_min, t.usd_max);
      inRange("CNY/TWD", r.cny, t.cny_min, t.cny_max);
      inputs.usd = r.usd;
      inputs.cny = r.cny;
      sources.fx = r.source;
    } catch (e) {
      console.error("[pipeline] 匯率抓取失敗：", e.message);
    }
  }

  // --- 抓取寶泰生鋁屑 ---
  if (inputs.baotai == null) {
    try {
      const r = await fetchBaotai();
      inRange("寶泰", r.value, t.baotai_min, t.baotai_max);
      inputs.baotai = r.value;
      sources.baotai = r.source;
    } catch (e) {
      console.error("[pipeline] 寶泰抓取失敗：", e.message);
    }
  }

  // 檢查缺漏欄位
  const fields = ["lme", "usd", "cny", "baotai"];
  let missing = fields.filter((f) => inputs[f] == null);

  // 尚有缺漏且非收尾階段 → 存暫存、回報失敗（排程層會啟動每小時重試）
  if (missing.length > 0 && !finalize) {
    jsonStore.writePartial({ date: today, inputs, sources });
    console.warn(`[pipeline] 缺少來源：${missing.join(", ")}，等待重試`);
    return { success: false, missing };
  }

  // --- 第三道防呆：收尾階段缺值沿用前一日並標註 ---
  const flags = {};
  if (missing.length > 0) {
    const prevInputs = previous ? previous.inputs : null;
    for (const f of missing) fallbackToPrevious(f, inputs, prevInputs, flags);
    missing = fields.filter((f) => inputs[f] == null);
    if (missing.length > 0) {
      // 連前一日資料都沒有 → 無法計價
      console.error(`[pipeline] 收尾失敗：${missing.join(", ")} 無前日值可沿用`);
      return { success: false, missing };
    }
  }

  // --- 第二道防呆：日波動警示（與前一日輸入比較，僅警示不阻擋） ---
  const warnings = {};
  if (previous && previous.inputs) {
    for (const f of fields) {
      const chk = checkDailyChange(f, inputs[f], previous.inputs[f], t.daily_change_alert_pct);
      if (chk.alert) warnings[f] = chk.pct;
    }
  }

  // --- 計價 ---
  const items = computePrices(inputs, cfg.params);
  // 依輸入沿用狀態標註品項：鋁骨系列依賴 lme+usd、生鋁屑依賴 baotai+cny
  for (const item of items) {
    const dep = item.group === "lme" ? ["lme", "usd"] : ["baotai", "cny"];
    if (dep.some((f) => flags[f])) item.flag = "前日參考價";
    delete item.group; // group 僅內部使用，不輸出到前端
  }

  // --- 儲存 ---
  const latest = {
    fetchDate: today,
    updatedAt: dayjs().tz(cfg.schedule.timezone).format(),
    inputs,
    sources,
    items,
    flags,
    warnings
  };
  jsonStore.writeLatest(latest);
  try {
    sqliteStore.saveDay(latest);
  } catch (e) {
    // SQLite 僅供歷史查詢，寫入失敗不影響報價上架
    console.error("[pipeline] SQLite 寫入失敗（不影響報價）：", e.message);
  }
  jsonStore.clearPartial();

  console.log(`[pipeline] ${today} 計價完成：`, items.map((i) => `${i.name}=${i.buy}`).join("、"));
  return { success: true, latest };
}

module.exports = { runPipeline, taipeiToday };
