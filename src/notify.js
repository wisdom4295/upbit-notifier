import { loadConfig } from './config.js';
import { fetchCandles } from './upbit.js';
import { detectSignals, summarize } from './indicators.js';
import { formatSignal, formatStatus, sendMessage } from './telegram.js';
import { loadState, saveState, getMarketState, setMarketState } from './state.js';
import { appendSignals } from './history.js';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const statusOnly = args.has('--status'); // 시그널과 무관하게 현재 상태만 보내기

const telegram = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  dryRun,
};

async function analyzeMarket(market, config, state) {
  const { periods, candleUnit, lookbackCandles, alerts, confirmOnClosedCandle } = config;
  const needed = periods.long + lookbackCandles + 2;

  let candles = await fetchCandles(market, candleUnit, needed);
  // 마지막 캔들은 아직 진행 중이라 값이 계속 바뀐다. 확정된 캔들만 판단에 쓴다.
  if (confirmOnClosedCandle) candles = candles.slice(0, -1);

  const summary = summarize(candles, periods);
  if (candles.length <= periods.long) {
    return { market, summary: null, signals: [], note: `캔들 ${candles.length}개로 MA${periods.long} 계산 불가` };
  }

  const marketState = getMarketState(state, market);
  // 최초 실행이면 과거 시그널을 몰아서 보내지 않도록 마지막 캔들만 본다.
  const fromIndex = marketState.lastCheckedUtc
    ? Math.max(candles.findIndex((c) => c.timeUtc > marketState.lastCheckedUtc), 1)
    : candles.length - 1;

  const signals =
    fromIndex <= 0
      ? [] // 새로 확정된 캔들 없음
      : detectSignals(candles, { ...periods, proximityThresholdPct: alerts.proximityThresholdPct, fromIndex })
          .filter((signal) => {
            if (signal.type === 'golden' && !alerts.goldenCross) return false;
            if (signal.type === 'dead' && !alerts.deadCross) return false;
            if (signal.type === 'proximity' && !alerts.proximity) return false;
            const already = marketState.lastSignalUtc?.[signal.type];
            return !already || signal.candle.timeUtc > already;
          });

  for (const signal of signals) {
    marketState.lastSignalUtc = { ...marketState.lastSignalUtc, [signal.type]: signal.candle.timeUtc };
  }
  marketState.lastCheckedUtc = candles.at(-1).timeUtc;
  setMarketState(state, market, marketState);

  return { market, summary, signals };
}

async function main() {
  const config = await loadConfig();
  const state = await loadState();
  const results = [];
  const failures = [];

  for (const market of config.markets) {
    try {
      results.push(await analyzeMarket(market, config, state));
    } catch (error) {
      // 한 종목이 실패해도 나머지 알림은 계속 보낸다.
      console.error(`[${market}] 실패:`, error.message);
      failures.push({ market, message: error.message });
    }
  }

  const signals = results.flatMap((r) => r.signals.map((signal) => ({ ...signal, market: r.market })));

  for (const signal of signals) {
    const text = formatSignal(signal, {
      market: signal.market,
      unit: config.candleUnit,
      ...config.periods,
    });
    await sendMessage(text, telegram);
    console.log(`[${signal.market}] ${signal.type} @ ${signal.candle.timeKst} 알림 전송`);
  }

  if (statusOnly) {
    await sendMessage(formatStatus(results, { unit: config.candleUnit, ...config.periods }), telegram);
  }

  if (!dryRun) {
    // 회고 대시보드가 읽을 수 있도록 발생한 시그널을 월별 파일에 남긴다.
    const added = await appendSignals(
      signals.map((signal) => ({
        ts: signal.candle.timeUtc,
        kst: signal.candle.timeKst,
        market: signal.market,
        type: signal.type,
        price: signal.candle.close,
        short: signal.short,
        long: signal.long,
        gapPct: signal.gapPct,
        unit: config.candleUnit,
      })),
    );
    if (added > 0) console.log(`이력 ${added}건 기록`);
    await saveState(state);
  }

  for (const result of results) {
    const { market, summary, note } = result;
    console.log(
      note
        ? `[${market}] ${note}`
        : `[${market}] 가격 ${summary?.price} · 이격 ${summary?.gapPct.toFixed(3)}% · 시그널 ${result.signals.length}건`,
    );
  }

  if (failures.length > 0) {
    if (failures.length === config.markets.length) {
      throw new Error(`모든 마켓 조회 실패: ${failures.map((f) => f.market).join(', ')}`);
    }
    console.warn(`일부 마켓 조회 실패: ${failures.map((f) => `${f.market}(${f.message})`).join(', ')}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
