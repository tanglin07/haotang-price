// pricing/guards.js — 三道防呆機制
// 第一道：抓取值合理區間驗證（超出即視為異常，觸發 fallback 或沿用前一日）
// 第二道：日波動閾值警示（與前一日比較，超過 % 發警示但不阻擋）
// 第三道：抓取失敗沿用前一日價格並標註（前端顯示「⚠ 前日參考價」）

// 第一道：合理區間驗證
function inRange(name, v, min, max) {
  if (v == null || Number.isNaN(v) || v < min || v > max) {
    throw new Error(`[防呆] ${name}=${v} 超出合理區間 [${min}, ${max}]`);
  }
  return v;
}

// 第二道：日波動閾值警示（不阻擋，僅記錄）
function checkDailyChange(name, today, yesterday, alertPct) {
  if (yesterday == null) return { alert: false };
  const pct = Math.abs((today - yesterday) / yesterday) * 100;
  if (pct > alertPct) {
    console.warn(`[警示] ${name} 單日波動 ${pct.toFixed(1)}% 超過 ${alertPct}%`);
    return { alert: true, pct: Number(pct.toFixed(1)) };
  }
  return { alert: false, pct: Number(pct.toFixed(1)) };
}

// 第三道：某輸入抓取失敗時沿用前一日值，並在 flags 標註
function fallbackToPrevious(field, inputs, prevInputs, flags) {
  if (inputs[field] == null && prevInputs && prevInputs[field] != null) {
    inputs[field] = prevInputs[field];
    flags[field] = "sued_previous"; // 前端據此顯示「⚠ 前日參考價」
    console.warn(`[防呆] ${field} 抓取失敗，沿用前一日值 ${prevInputs[field]}`);
  }
  return inputs;
}

module.exports = { inRange, checkDailyChange, fallbackToPrevious };
