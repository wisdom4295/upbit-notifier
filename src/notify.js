import { loadConfig, saveMarkets } from './config.js';
import { fetchCandles, fetchMarketCodes } from './upbit.js';
import { detectSignals, summarize } from './indicators.js';
import { formatSignal, formatStatus, sendMessage, fetchUpdates } from './telegram.js';
import { loadState, saveState, getMarketState, setMarketState } from './state.js';
import { appendSignals } from './history.js';
import { parseCommand, applyCommand } from './commands.js';

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

  // 상태는 전송이 끝난 뒤에 갱신한다. 여기서 미리 기록하면 전송이 실패했을 때
  // 보내지 못한 알림이 '보낸 것'으로 남아 영영 사라진다.
  return { market, summary, signals, marketState, checkedUtc: candles.at(-1).timeUtc };
}

/**
 * 텔레그램으로 온 명령을 처리한다. 코드를 건드리지 않고 폰에서 감시 목록을
 * 바꾸기 위한 통로다. 설정된 대화방에서 온 명령만 받아들인다.
 *
 * @returns {Promise<{markets: string[], statusRequested: boolean}>}
 */
async function handleCommands(config, state) {
  let markets = config.markets;
  let statusRequested = false;
  if (dryRun) return { markets, statusRequested };

  let updates;
  try {
    updates = await fetchUpdates({ token: telegram.token, offset: state.lastUpdateId ? state.lastUpdateId + 1 : undefined });
  } catch (error) {
    // 명령을 못 읽어도 알림은 계속 나가야 한다.
    console.error('명령 조회 실패:', error.message);
    return { markets, statusRequested };
  }

  let availableMarkets = [];
  const hasEdit = updates.some((u) => ['add', 'remove'].includes(parseCommand(u.message?.text)?.name));
  if (hasEdit) {
    // 있지도 않은 코인을 목록에 넣지 않도록 실제 마켓 목록과 대조한다.
    availableMarkets = await fetchMarketCodes().catch(() => []);
  }

  for (const update of updates) {
    state.lastUpdateId = Math.max(state.lastUpdateId ?? 0, update.update_id);

    const message = update.message;
    // 설정된 대화방이 아니면 무시한다. 봇 이름을 아는 누구나 목록을 바꿀 수는 없다.
    if (!message?.text || String(message.chat?.id) !== String(telegram.chatId)) continue;

    const command = parseCommand(message.text);
    if (!command) continue;

    const result = applyCommand(command, { markets, availableMarkets, chatId: message.chat.id });
    if (result.changed) {
      markets = result.markets;
      await saveMarkets(markets);
      console.log(`명령 처리: /${command.name} ${command.arg} → ${markets.length}개`);
    }
    if (command.name === 'status') statusRequested = true;
    if (result.reply) await sendMessage(result.reply, telegram);
  }

  return { markets, statusRequested };
}

async function main() {
  const config = await loadConfig();
  const state = await loadState();

  // 명령을 먼저 처리해야 방금 추가한 코인도 이번 실행부터 감시된다.
  const { markets, statusRequested } = await handleCommands(config, state);
  config.markets = markets;
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
  const sendFailures = new Map();

  for (const result of results) {
    if (!result.marketState) continue;

    for (const signal of result.signals) {
      const text = formatSignal(signal, {
        market: result.market,
        unit: config.candleUnit,
        ...config.periods,
      });
      try {
        await sendMessage(text, telegram);
        // 보낸 것만 기록해야 중복도 누락도 없다.
        result.marketState.lastSignalUtc = {
          ...result.marketState.lastSignalUtc,
          [signal.type]: signal.candle.timeUtc,
        };
        console.log(`[${result.market}] ${signal.type} @ ${signal.candle.timeKst} 알림 전송`);
      } catch (error) {
        // 한 건이 실패해도 나머지는 계속 보낸다.
        console.error(`[${result.market}] ${signal.type} 전송 실패:`, error.message);
        sendFailures.set(result.market, (sendFailures.get(result.market) ?? 0) + 1);
      }
    }

    // 전송에 실패한 마켓은 확인 지점을 그대로 두어 다음 실행에서 다시 시도한다.
    // 이미 보낸 건은 lastSignalUtc가 막아 주므로 중복되지 않는다.
    if (!sendFailures.has(result.market)) {
      result.marketState.lastCheckedUtc = result.checkedUtc;
    }
    setMarketState(state, result.market, result.marketState);
  }

  if (statusOnly || statusRequested) {
    await sendMessage(formatStatus(results, { unit: config.candleUnit, ...config.periods }), telegram);
  }

  if (!dryRun) {
    // 회고 대시보드가 읽을 수 있도록 발생한 시그널을 월별 파일에 남긴다.
    // 여기서 실패해도 상태 저장까지 막으면 같은 알림이 매 실행마다 다시 나간다.
    // 이력이 한 건 빠지는 것보다 중복 알림이 훨씬 나쁘므로 따로 처리한다.
    try {
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
    } catch (error) {
      console.error('이력 기록 실패 (알림 상태는 정상 저장):', error.message);
    }
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

  if (sendFailures.size > 0) {
    const total = [...sendFailures.values()].reduce((a, b) => a + b, 0);
    throw new Error(
      `알림 ${total}건 전송 실패 (${[...sendFailures.keys()].join(', ')}) — 다음 실행에서 다시 시도합니다.`,
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
