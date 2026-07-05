# 浩堂廢鋁每日報價網站

每日 07:00（台灣時間）自動抓取 **LME 3M 鋁價、台銀 USD/CNY 匯率（即期賣出）、寶泰生鋁屑價**，
套用固定計價公式，網頁顯示五品項（鋁骨、濁鋁骨、6頭鋁屑、混合鋁屑、生鋁屑）的收購價與報價。

## 快速開始

```bash
npm install
cp .env.example .env        # 選填 METALS_DEV_KEY（沒有也能跑，走 Westmetall）
npm run test-fetch          # 驗證三個資料來源
npm run fetch-now           # 手動抓一次並產生報價
npm start                   # 啟動網站（http://localhost:3000）+ 每日排程
```

## 運作方式

1. **排程**：每日 07:00（Asia/Taipei）抓取；任一來源失敗 → 每小時重試；
   23:00 仍失敗 → 缺值沿用前一日並於網頁標註「⚠ 前日參考價」。
2. **防呆**：合理區間驗證（抓錯欄位立即攔截）、單日波動 >8% 警示、失敗沿用前日。
3. **儲存**：`data/prices-latest.json`（網頁顯示用）+ `data/history.sqlite`（每日歷史）。

## 資料來源與備援

| 輸入 | 首選 | 備援 |
|---|---|---|
| LME 3M 鋁價 | Westmetall 表格（有 METALS_DEV_KEY 時改 metals.dev 首選） | 互為備援 |
| USD/CNY 匯率 | 台銀 CSV（即期賣出） | 台銀 HTML 牌告頁 |
| 寶泰生鋁屑 | 寶泰網站「今日价格」 | `data/manual-baotai.json` 人工輸入 |

**寶泰人工輸入**：寶泰網站連不上時，編輯 `data/manual-baotai.json` 填入當日价格即可。

## 調整參數

所有 K 值、扣項、閾值、排程時間都在 `config.json`，改完重啟 `npm start` 生效，無需改程式碼。

## 部署注意

需要常駐執行的環境（小型 VPS 或不會休眠的 PaaS），否則 cron 排程不會觸發。
