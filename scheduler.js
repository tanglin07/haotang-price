// scheduler.js — 排程層
// 每日 07:00（Asia/Taipei）主抓取 → 任一來源失敗轉每小時重試 → 23:00 收尾（缺值沿用前日強制產出）
const cron = require("node-cron");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const timezone = require("dayjs/plugin/timezone");
dayjs.extend(utc);
dayjs.extend(timezone);

const { runPipeline, taipeiToday } = require("./pipeline");
const jsonStore = require("./store/json");

let hourlyTask = null;

function startScheduler(cfg) {
  const tz = cfg.schedule.timezone;

  // 判斷「今天是否已成功抓到當日資料」
  // 定義：今天成功執行過一次完整抓取並算出價格（來源本身為前一交易日數據屬正常，如週末假日）
  function hasTodayData() {
    const latest = jsonStore.readLatest();
    return latest && latest.fetchDate === taipeiToday(tz);
  }

  async function attempt(reason, opts = {}) {
    console.log(`[排程] 觸發抓取（${reason}）`);
    try {
      const result = await runPipeline(cfg, opts);
      if (result.success && hasTodayData()) {
        console.log("[排程] 已取得當日資料，停止每小時重試");
        if (hourlyTask) {
          hourlyTask.stop();
          hourlyTask = null;
        }
      } else {
        startHourlyRetry();
      }
    } catch (e) {
      console.error("[排程] pipeline 執行異常：", e.message);
      startHourlyRetry();
    }
  }

  function startHourlyRetry() {
    if (hourlyTask) return; // 已在重試中
    console.log("[排程] 啟動每小時重試模式");
    // 每小時第 0 分重試（重試階段 LME 一律走 Westmetall 保護 metals.dev 額度）
    hourlyTask = cron.schedule("0 * * * *", () => attempt("每小時重試", { isRetry: true }), {
      timezone: tz
    });
  }

  // 每日 07:00 主排程
  cron.schedule(`0 ${cfg.schedule.daily_hour} * * *`, () => attempt("每日 07:00"), {
    timezone: tz
  });

  // 每日 23:00 收尾：若整天仍失敗，缺值沿用前一日並標註，維持網站可用
  cron.schedule(`0 ${cfg.schedule.finalize_hour} * * *`, () => {
    if (!hasTodayData()) attempt("23:00 收尾", { isRetry: true, finalize: true });
  }, { timezone: tz });

  console.log(`[排程] 已啟動：每日 0${cfg.schedule.daily_hour}:00（${tz}），失敗每小時重試，${cfg.schedule.finalize_hour}:00 收尾`);

  // 啟動時檢查：若今天尚無資料且已過 07:00，立即補抓一次（伺服器重啟不漏抓）
  const nowHour = dayjs().tz(tz).hour();
  if (!hasTodayData() && nowHour >= cfg.schedule.daily_hour) {
    attempt("啟動補抓");
  }
}

module.exports = { startScheduler };
