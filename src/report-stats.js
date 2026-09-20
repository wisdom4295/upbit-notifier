/**
 * 리포트에 쓰는 집계. 투자하는 쪽에서 알고 싶은 것만 남긴다.
 * 순수 함수라 네트워크 없이 시험할 수 있다.
 */
import { summarize } from './indicators.js';

/** 기간 동안 얼마나 움직였는지. 직전 종가를 기준으로 삼는다. */
export function periodMove(candles, fromMs, toMs = Infinity) {
  const within = candles.filter((candle) => candle.ms >= fromMs && candle.ms < toMs);
  if (within.length === 0) return null;

  // 기간이 시작되기 직전 종가가 기준. 없으면 기간 첫 캔들로 대신한다.
  const previous = candles.filter((candle) => candle.ms < fromMs).at(-1);
  const baseline = previous?.close ?? within[0].close;
  const last = within.at(-1).close;

  return {
    last,
    changePct: baseline ? ((last - baseline) / baseline) * 100 : null,
    high: Math.max(...within.map((candle) => candle.high ?? candle.close)),
    low: Math.min(...within.map((candle) => candle.low ?? candle.close)),
  };
}

/**
 * 두 선이 지금 얼마나 벌어져 있고, 기간 시작 때보다 좁혀졌는지.
 * 좁혀지는 중이면 교차가 가까워지고 있다는 뜻이라 다음에 주목할 종목이 된다.
 */
export function gapTrend(candles, periods, fromMs) {
  const now = summarize(candles, periods);
  if (!now) return null;

  const past = candles.filter((candle) => candle.ms <= fromMs);
  const before = past.length > periods.long ? summarize(past, periods) : null;

  return {
    gapPct: now.gapPct,
    closing: before ? Math.abs(now.gapPct) < Math.abs(before.gapPct) : null,
  };
}
