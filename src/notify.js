import { loadConfig, saveMarkets } from './config.js';
import { fetchCandles, fetchDailyCandles, fetchMarkets } from './upbit.js';
import { detectSignals, detectBreakouts, dailyLineFor, summarize, nextScanIndex } from './indicators.js';
import { formatSignal, formatStatus, sendMessage, fetchUpdates } from './telegram.js';
import { loadState, saveState, getMarketState, setMarketState } from './state.js';
import { appendSignals } from './history.js';
import { parseCommand, interpret, applyCommand } from './commands.js';
import { dueReports, markReportSent } from './schedule.js';
import { buildReport } from './report.js';

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

  // 100일선은 일봉으로 낸다. 분봉으로 100일을 채우려면 9,600봉이 필요하다.
  let line = new Array(candles.length).fill(null);
  if (periods.vwmaDays) {
    try {
      const daily = await fetchDailyCandles(market, periods.vwmaDays + 2);
      line = dailyLineFor(candles, daily, periods.vwmaDays);
    } catch (error) {
      // 기준선을 못 받아도 50선·200선 알림은 그대로 나가야 한다.
      console.error(`[${market}] 일봉 조회 실패 (거래량가중선 건너뜀):`, error.message);
    }
  }

  const summary = summarize(candles, periods, line.at(-1) ?? null);
  if (candles.length <= periods.long) {
    return { market, summary: null, signals: [], note: `캔들 ${candles.length}개로 MA${periods.long} 계산 불가` };
  }

  const marketState = getMarketState(state, market);
  const nextIndex = nextScanIndex(candles, marketState.lastCheckedUtc);

  const enabled = {
    golden: alerts.goldenCross,
    dead: alerts.deadCross,
    proximity: alerts.proximity,
    breakUp: alerts.vwmaBreakUp,
    breakDown: alerts.vwmaBreakDown,
  };

  // 새 캔들 없음 (또는 첫 캔들뿐이라 직전과 비교 불가)
  const found =
    nextIndex <= 0
      ? []
      : [
          ...detectSignals(candles, { ...periods, proximityThresholdPct: alerts.proximityThresholdPct, fromIndex: nextIndex }),
          ...detectBreakouts(candles, { line, marginPct: alerts.vwmaMarginPct, fromIndex: nextIndex }),
        ];

  const signals = found
    .filter((signal) => {
      if (!enabled[signal.type]) return false;
      const already = marketState.lastSignalUtc?.[signal.type];
      return !already || signal.candle.timeUtc > already;
    })
    // 같은 실행에서 여러 종류가 잡히면 일어난 순서대로 보낸다.
    .sort((a, b) => a.index - b.index);

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

  // 한글 이름으로 찾고, 있지도 않은 코인이 들어가지 않도록 실제 목록과 대조한다.
  // 번호를 고르는 답장은 띄워 둔 목록에 이름이 남아 있어 목록을 다시 받지 않아도 된다.
  let availableMarkets = [];
  const needsList = updates.some((u) =>
    ['add', 'remove', 'list'].includes(parseCommand(u.message?.text)?.name));
  if (needsList) availableMarkets = await fetchMarkets().catch(() => []);

  for (const update of updates) {
    state.lastUpdateId = Math.max(state.lastUpdateId ?? 0, update.update_id);

    const message = update.message;
    // 설정된 대화방이 아니면 무시한다. 봇 이름을 아는 누구나 목록을 바꿀 수는 없다.
    if (!message?.text || String(message.chat?.id) !== String(telegram.chatId)) continue;

    // 번호만 적은 답장은 고를 목록을 띄워 둔 동안에만 명령으로 친다.
    const command = interpret(message.text, { hasPending: Boolean(state.pending) });
    if (!command) continue;

    const result = applyCommand(command, {
      markets,
      availableMarkets,
      chatId: message.chat.id,
      pending: state.pending,
      now: Date.now(),
    });
    // undefined 는 '그대로 두라'는 뜻이다. null 이어야 지운다.
    if (result.pending !== undefined) state.pending = result.pending;
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
    // 리포트는 이 파일을 읽으므로 리포트보다 먼저 남겨야 한다. 순서가 반대면
    // 이번 실행에서 막 감지한 알림이 같은 실행의 리포트에서 빠진다.
    // 밤 10시 리포트는 21:45봉을 감지하는 실행과 늘 겹치므로 매일 한 건씩 샜다.
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
          line: signal.line,
          gapPct: signal.gapPct,
          unit: config.candleUnit,
        })),
      );
      if (added > 0) console.log(`이력 ${added}건 기록`);
    } catch (error) {
      console.error('이력 기록 실패 (알림 상태는 정상 저장):', error.message);
    }
  }

  // 밤 10시 리포트를 GitHub 스케줄에 맡기면 건너뛸 때 같이 사라진다.
  // 실행될 때마다 보낼 때가 됐는지 스스로 확인해, 늦더라도 하루 한 번은 보낸다.
  if (!dryRun && !statusOnly) {
    for (const period of dueReports(state)) {
      try {
        const { text, signals: reported } = await buildReport(period, config);
        await sendMessage(text, telegram);
        markReportSent(state, period);
        console.log(`${period} 리포트 전송 (신호 ${reported.length}건)`);
      } catch (error) {
        // 리포트가 실패해도 알림 기능 자체는 멀쩡해야 한다.
        console.error(`${period} 리포트 실패:`, error.message);
      }
    }
  }

  if (!dryRun) await saveState(state);

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
