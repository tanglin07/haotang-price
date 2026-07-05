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

## 部署（GitHub Pages，已上線）

- **正式網址**：https://tanglin07.github.io/haotang-price/
- **部署 repo**：https://github.com/tanglin07/haotang-price（公開；本目錄為開發主拷貝，改版後需同步推送過去）
- **自動更新**：GitHub Actions（`.github/workflows/update-prices.yml`）每日台北時間 07:00 與 09:00
  執行 `npm run build-static`：抓價 → 計價 → 產生 `docs/`（靜態頁 + prices-latest.json + quote.pdf）→ 自動 commit，Pages 隨即重新發布
- **手動更新價格**：到部署 repo 的 Actions 分頁 → 「每日更新報價」→ Run workflow（手機 GitHub App 也可操作）；
  網頁上的「更新價格」按鈕僅在伺服器模式（本機/VPS）顯示，靜態版自動隱藏
- **前一日沿用**：`data/prices-latest.json` 有進版控，作為隔日建置時「沿用前日」防呆的依據
- **自訂網域（選配）**：買網域後在部署 repo Settings → Pages 設定 custom domain 即可，不買也能用上述網址

### 伺服器模式（替代方案）

`npm start` 可在常駐環境（小型 VPS）跑完整伺服器版：內建 node-cron 排程、
「更新價格」按鈕即時重抓、PDF 即時產生。
