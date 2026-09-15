/**
 * 단순이동평균. period를 채우지 못한 구간은 null로 남겨
 * 인덱스가 원본 캔들 배열과 1:1로 맞도록 한다.
 */
export function sma(values, period) {
  const result = new Array(values.length).fill(null);
  let sum = 0;

  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) result[i] = sum / period;
  }

  return result;
}

/**
 * 두 이평선의 교차(골든/데드)와 근접 진입을 찾는다.
 *
 * - 교차: 직전 캔들과 이격 부호가 바뀐 지점
 * - 근접: 이격률이 임계치 밖에 있다가 안으로 "들어온" 지점 (같은 구간에 머무는 동안 재알림 없음)
 *
 * @param {{timeUtc: string, timeKst: string, close: number}[]} candles 과거순 캔들
 * @returns {{type: 'golden'|'dead'|'proximity', index: number, candle: object, short: number, long: number, gapPct: number}[]}
 */
export function detectSignals(candles, { short, long, proximityThresholdPct, fromIndex = 1 }) {
  const closes = candles.map((c) => c.close);
  const shortSma = sma(closes, short);
  const longSma = sma(closes, long);
  const signals = [];

  const start = Math.max(fromIndex, long); // long-1이 첫 유효값이므로 비교는 long부터
  for (let i = start; i < candles.length; i += 1) {
    const prevShort = shortSma[i - 1];
    const prevLong = longSma[i - 1];
    const currShort = shortSma[i];
    const currLong = longSma[i];
    if (prevShort == null || prevLong == null || currShort == null || currLong == null) continue;
    if (prevLong === 0 || currLong === 0) continue; // 이격률이 NaN이 된다

    const prevGap = prevShort - prevLong;
    const currGap = currShort - currLong;
    const gapPct = (currGap / currLong) * 100;
    const base = { index: i, candle: candles[i], short: currShort, long: currLong, gapPct };

    if (prevGap <= 0 && currGap > 0) {
      signals.push({ type: 'golden', ...base });
    } else if (prevGap >= 0 && currGap < 0) {
      signals.push({ type: 'dead', ...base });
    } else {
      const prevPct = Math.abs((prevGap / prevLong) * 100);
      const currPct = Math.abs(gapPct);
      if (prevPct > proximityThresholdPct && currPct <= proximityThresholdPct) {
        signals.push({ type: 'proximity', ...base });
      }
    }
  }

  return signals;
}

/** 현재 시점의 이평선 상태 요약 (메시지·대시보드 공용) */
export function summarize(candles, { short, long }) {
  const closes = candles.map((c) => c.close);
  const shortSma = sma(closes, short);
  const longSma = sma(closes, long);
  const i = candles.length - 1;

  // 캔들이 없으면 i가 -1이 되어 배열 밖을 읽는다. == null로 undefined까지 함께 막는다.
  if (i < 0 || shortSma[i] == null || longSma[i] == null) return null;
  // 장기선이 0이면 이격률이 NaN이 되어 화면에 그대로 새어 나간다.
  if (longSma[i] === 0) return null;

  return {
    time: candles[i].timeKst,
    price: closes[i],
    short: shortSma[i],
    long: longSma[i],
    gapPct: ((shortSma[i] - longSma[i]) / longSma[i]) * 100,
  };
}
