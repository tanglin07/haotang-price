// pricing/engine.js — 計價引擎：套用五條固定公式（公式不可更改，參數一律讀 config）
// 輸入：{ lme, usd, cny, baotai }（LME 美元/噸、台銀即期賣出匯率、寶泰人民幣/噸）
// 輸出：五品項 { name, buy, quote }（元/kg）
// 精度原則：內部保留完整精度連乘（濁鋁骨以「未四捨五入的鋁骨」計算），僅輸出時四捨五入至小數第 2 位

// 四捨五入至小數第 2 位（僅顯示用）
function round2(v) {
  return Math.round(v * 100) / 100;
}

function computePrices(inputs, params) {
  const { lme, usd, cny, baotai } = inputs;
  const p = params;

  // 1. 鋁骨 = LME × USD × 0.95 ÷ 1000
  const aluBoneRaw = (lme * usd * p.K_alu_bone) / 1000;
  // 2. 濁鋁骨 = 鋁骨收購價 × 0.84（用未四捨五入的鋁骨，避免誤差累積）
  const turbidRaw = aluBoneRaw * p.K_turbid_ratio;
  // 3. 6頭鋁屑 = LME × USD × 0.65 ÷ 1000
  const scrap6Raw = (lme * usd * p.K_scrap_6head) / 1000;
  // 4. 混合鋁屑 = LME × USD × 0.58 ÷ 1000
  const scrapMixRaw = (lme * usd * p.K_scrap_mixed) / 1000;
  // 5. 生鋁屑 = [(寶泰今日价格 × CNY × 0.8) − 700] ÷ 1000 − 10
  //    括號位置經浩堂確認（2026-07-05）：先扣 700、再除以 1000、最後扣 10 損耗
  const rawAluRaw = (baotai * cny * p.baotai_factor - p.baotai_deduct) / 1000 - p.baotai_loss;

  // 報價 = 收購價 − quote_deduct（預設 5 元/kg，全品項一律）
  const mkItem = (name, raw, group) => ({
    name,
    buy: round2(raw),
    quote: round2(raw - p.quote_deduct),
    // group 標記此品項依賴哪組輸入（lme+usd 或 baotai+cny），供沿用前日標註使用
    group,
    flag: null
  });

  return [
    mkItem("鋁骨", aluBoneRaw, "lme"),
    mkItem("濁鋁骨", turbidRaw, "lme"),
    mkItem("6頭鋁屑", scrap6Raw, "lme"),
    mkItem("混合鋁屑", scrapMixRaw, "lme"),
    mkItem("生鋁屑", rawAluRaw, "baotai")
  ];
}

module.exports = { computePrices, round2 };
