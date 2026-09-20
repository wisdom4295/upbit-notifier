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

/**
 * 거래량가중 이동평균(VWMA). 거래가 많았던 봉을 더 무겁게 쳐서 내는 평균이라
 * "사람들이 실제로 많이 사고판 가격대"에 가깝다. 거래가 없던 구간은 null.
 *
 * @param {{close: number, volume: number}[]} candles 과거순 캔들
 */
export function vwma(candles, period) {
  const result = new Array(candles.length).fill(null);
  let weighted = 0;
  let volume = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const amount = candles[i].volume ?? 0;
    weighted += candles[i].close * amount;
    volume += amount;
    if (i >= period) {
      const out = candles[i - period];
      weighted -= out.close * (out.volume ?? 0);
      volume -= out.volume ?? 0;
    }
    // 그 구간에 거래가 한 건도 없었으면 평균을 낼 수 없다(0으로 나눈다).
    if (i >= period - 1 && volume > 0) result[i] = weighted / volume;
  }

  return result;
}

/**
 * 일봉으로 낸 거래량가중 이평선을, 분봉 캔들 하나하나에 맞춰 늘어놓는다.
 *
 * 분봉 캔들이 어느 날에 속하든 그 날 **직전까지 마감된** 일봉으로 낸 값을 쓴다.
 * 오늘 일봉은 장중이라 계속 바뀌므로 기준선으로 삼으면 판정이 흔들린다.
 *
 * @param {{timeKst: string}[]} candles 분봉 (과거순)
 * @param {{date: string, close: number, volume: number}[]} daily 일봉 (과거순)
 * @returns {(number|null)[]} candles와 길이가 같은 배열
 */
export function dailyLineFor(candles, daily, period) {
  const values = vwma(daily, period);
  // (날짜, 그 날까지로 낸 값) 을 과거순으로. 분봉 날짜보다 앞선 마지막 값을 쓴다.
  const marks = daily
    .map((candle, i) => ({ date: candle.date, value: values[i] }))
    .filter((mark) => mark.value != null);

  let cursor = -1;
  return candles.map((candle) => {
    const date = candle.timeKst.slice(0, 10);
    while (cursor + 1 < marks.length && marks[cursor + 1].date < date) cursor += 1;
    return cursor >= 0 ? marks[cursor].value : null;
  });
}

/**
 * 캔들이 기준선을 뚫은 지점을 찾는다.
 *
 * 종가가 선을 스치기만 해도 알리면 잔파동에 여러 번 울린다. 그래서 선에서
 * marginPct만큼 확실히 벗어나야 "넘어간 것"으로 치고, 그 폭 안에 있는 동안은
 * 직전에 있던 쪽에 그대로 머문 것으로 본다. 한번 넘어가면 반대쪽으로 그만큼
 * 벗어나기 전까지 다시 알리지 않는다.
 *
 * @param {object[]} candles 분봉 (과거순)
 * @param {(number|null)[]} line 캔들마다의 기준선 값
 * @returns {{type: 'breakUp'|'breakDown', index: number, candle: object, line: number, gapPct: number}[]}
 */
export function detectBreakouts(candles, { line, marginPct = 0, fromIndex = 1 }) {
  const signals = [];
  let side = 0; // -1 아래 · +1 위 · 0 아직 모름

  // 어느 쪽에 있었는지를 알아야 '넘어갔다'를 판단할 수 있으므로 처음부터 훑는다.
  for (let i = 0; i < candles.length; i += 1) {
    const curr = line[i];
    if (curr == null || curr === 0) continue;

    const gapPct = ((candles[i].close - curr) / curr) * 100;
    const next = gapPct > marginPct ? 1 : gapPct < -marginPct ? -1 : side;

    // side가 0이면 어디서 왔는지 모르는 첫 판정이라 알리지 않는다.
    if (next !== side && side !== 0 && i >= fromIndex) {
      signals.push({
        type: next > 0 ? 'breakUp' : 'breakDown',
        index: i,
        candle: candles[i],
        line: curr,
        gapPct,
      });
    }
    side = next;
  }

  return signals;
}

/**
 * 어디서부터 다시 살펴볼지 정한다.
 *
 * - 최초 실행: 마지막 캔들만. 과거 교차를 몰아서 알리지 않기 위해서다.
 * - 그 뒤: 마지막으로 확인한 캔들 다음부터. 실행이 밀려 여러 봉을 건너뛰었어도
 *   그 사이가 전부 포함된다.
 * - 새 캔들이 아직 없으면 -1. 이때 억지로 훑으면 확인 지점보다 앞선 교차가
 *   뒤늦게 알림으로 나간다.
 */
export function nextScanIndex(candles, lastCheckedUtc) {
  if (!lastCheckedUtc) return candles.length - 1;
  return candles.findIndex((candle) => candle.timeUtc > lastCheckedUtc);
}

/** 현재 시점의 이평선 상태 요약 (메시지·대시보드 공용) */
export function summarize(candles, { short, long }, line = null) {
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
    line,
    linePct: line ? ((closes[i] - line) / line) * 100 : null,
  };
}
