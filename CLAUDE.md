# 浩堂廢鋁每日報價網站

## 專案目的
每日 07:00（台灣時間）自動抓取 LME 3M 鋁價、USD/TWD、CNY/TWD、寶泰生鋁屑價，
套用固定計價公式，於網站顯示五品項的「收購價」與「報價」。

## 鐵則（不可違反）
1. 五條計價公式不可更改（見 `pricing/engine.js` 與 config.json）。
2. K 值、扣項、閾值一律從 config.json 讀取，不可寫死在程式碼。
3. 所有程式碼註解使用繁體中文。
4. 排程時區固定 Asia/Taipei。
5. 任一來源抓取失敗時：先走 fallback 來源，再不行則沿用前一日並在前端標註，
   絕不可顯示空值或未驗證的離譜值。

## 計價公式（浩堂已確認，2026-07-05）
- 匯率口徑：台銀「**即期賣出**」（config.fx.rate_type = spot_sell）。
- 鋁骨 = LME × USD × 0.95 ÷ 1000；濁鋁骨 = 鋁骨 × 0.84；
  6頭鋁屑 = LME × USD × 0.65 ÷ 1000；混合鋁屑 = LME × USD × 0.58 ÷ 1000。
- 生鋁屑 = [(寶泰今日价格 × CNY × 0.8) − 700] ÷ 1000 − 10（括號位置已確認）。
- 報價 = 收購價 − 5（全品項一律，config 可調）。

## 資料來源
- LME 3M：**Westmetall 為主**（表格第 3 欄 3-month）；`.env` 有 METALS_DEV_KEY 時
  首抓改以 metals.dev 為首選（欄位 lme_aluminum，美元/公噸）。
  重試階段一律 Westmetall（metals.dev 免費僅 100 次/月）。
- 匯率：台銀 CSV `/xrt/flcsv/0/day` 取「即期賣出」→ 備援台銀 HTML。
  CSV 解析以「本行買入／本行賣出」文字標記定位欄位（標記 +2 = 即期）。
- 生鋁屑：baotaigroup.com.cn id/97「今日价格」→ 備援 `data/manual-baotai.json`。

## 防呆
合理區間驗證 + 日波動 >8% 警示 + 失敗沿用前日並標註。詳見 `pricing/guards.js`。

## 常用指令
- `npm run test-fetch`：驗證三來源（含台銀 CSV 原始列印出，可核對欄位）。
- `npm run fetch-now`：手動跑一次完整 pipeline。
- `npm start`：啟動網站 + 排程。
