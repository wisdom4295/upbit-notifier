import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, detectSignals, summarize, nextScanIndex, vwma, detectBreakouts, dailyLineFor } from '../src/indicators.js';

const toCandles = (closes) =>
  closes.map((close, i) => ({
    timeUtc: `2026-01-01T00:${String(i).padStart(2, '0')}:00`,
    timeKst: `2026-01-01T09:${String(i).padStart(2, '0')}:00`,
    close,
  }));

test('sma는 period를 채우기 전까지 null을 둔다', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 3), [null, null, 2, 3]);
});

test('sma는 이동창을 정확히 굴린다', () => {
  assert.deepEqual(sma([10, 20, 30, 40, 50], 2), [null, 15, 25, 35, 45]);
});

test('상승 전환에서 골든크로스를 잡는다', () => {
  // 하락 후 급반등: 단기선이 장기선을 아래에서 위로 통과
  const closes = [...Array.from({ length: 30 }, (_, i) => 100 - i), ...Array.from({ length: 30 }, (_, i) => 70 + i * 4)];
  const signals = detectSignals(toCandles(closes), { short: 3, long: 10, proximityThresholdPct: 0.3 });
  const golden = signals.filter((s) => s.type === 'golden');
  assert.equal(golden.length, 1);
  assert.ok(golden[0].index > 30);
});

test('하락 전환에서 데드크로스를 잡는다', () => {
  const closes = [...Array.from({ length: 30 }, (_, i) => 100 + i), ...Array.from({ length: 30 }, (_, i) => 130 - i * 4)];
  const signals = detectSignals(toCandles(closes), { short: 3, long: 10, proximityThresholdPct: 0.3 });
  assert.equal(signals.filter((s) => s.type === 'dead').length, 1);
});

test('근접 알림은 임계치 안으로 들어온 순간에만 1회 발생한다', () => {
  // 강한 상승으로 이평선이 벌어진 뒤 횡보하며 교차 없이 서서히 붙는 흐름
  const closes = [...Array.from({ length: 40 }, (_, i) => 100 + i * 2), ...Array(20).fill(178)];
  const signals = detectSignals(toCandles(closes), { short: 3, long: 10, proximityThresholdPct: 0.3 });
  const proximity = signals.filter((s) => s.type === 'proximity');
  assert.equal(proximity.length, 1, '같은 근접 구간에 머무는 동안 재알림 없음');
  assert.ok(proximity[0].index >= 40, '횡보 구간에서 붙는다');
});

test('fromIndex 이전 구간은 건너뛴다', () => {
  const closes = [...Array.from({ length: 30 }, (_, i) => 100 - i), ...Array.from({ length: 30 }, (_, i) => 70 + i * 4)];
  const candles = toCandles(closes);
  const params = { short: 3, long: 10, proximityThresholdPct: 0.3 };
  const all = detectSignals(candles, params);
  const tail = detectSignals(candles, { ...params, fromIndex: candles.length - 1 });
  assert.ok(all.length > tail.length);
});

test('데이터가 long 기간보다 짧으면 요약은 null', () => {
  assert.equal(summarize(toCandles([1, 2, 3]), { short: 2, long: 10 }), null);
});

test('요약은 현재 이격률을 퍼센트로 준다', () => {
  const result = summarize(toCandles([...Array(9).fill(100), 110]), { short: 2, long: 10 });
  assert.equal(result.price, 110);
  assert.equal(result.long, 101);
  assert.equal(result.short, 105);
  assert.ok(Math.abs(result.gapPct - ((105 - 101) / 101) * 100) < 1e-9);
});

test('캔들이 비어 있으면 요약은 null (배열 밖을 읽지 않는다)', () => {
  assert.equal(summarize([], { short: 50, long: 200 }), null);
  assert.equal(summarize(toCandles([]), { short: 2, long: 3 }), null);
});

test('가격이 0이면 이격률이 NaN이 되므로 요약하지 않는다', () => {
  const zeros = toCandles([0, 0, 0, 0, 0]);
  assert.equal(summarize(zeros, { short: 2, long: 3 }), null);
});

test('가격이 0인 구간은 시그널로 잡지 않는다', () => {
  const signals = detectSignals(toCandles([0, 0, 0, 0, 0, 0, 0, 0]), {
    short: 2, long: 3, proximityThresholdPct: 0.3,
  });
  assert.deepEqual(signals, []);
});

test('소수점 가격도 정상 계산한다', () => {
  const result = summarize(toCandles([0.1, 0.2, 0.3, 0.4]), { short: 2, long: 4 });
  assert.equal(result.price, 0.4);
  assert.ok(Number.isFinite(result.gapPct));
});

test('최초 실행은 마지막 캔들만 본다 (과거를 몰아 보내지 않는다)', () => {
  const candles = toCandles([1, 2, 3, 4, 5]);
  assert.equal(nextScanIndex(candles, null), 4);
});

test('확인한 지점 다음 캔들부터 본다', () => {
  const candles = toCandles([1, 2, 3, 4, 5]);
  assert.equal(nextScanIndex(candles, candles[2].timeUtc), 3);
});

test('실행이 여러 봉 밀렸어도 건너뛴 구간이 전부 포함된다', () => {
  const candles = toCandles([1, 2, 3, 4, 5]);
  assert.equal(nextScanIndex(candles, candles[0].timeUtc), 1, '1번부터 끝까지 훑는다');
});

test('새 캔들이 없으면 -1 — 훑지 않는다', () => {
  const candles = toCandles([1, 2, 3, 4, 5]);
  assert.equal(nextScanIndex(candles, candles.at(-1).timeUtc), -1);
});

// --- 거래량가중 이평선 ---

const bar = (close, volume) => ({ close, volume, timeUtc: '', timeKst: '' });

test('거래량선은 거래가 많았던 봉을 더 무겁게 친다', () => {
  // 같은 두 가격이라도 거래가 100:1이면 평균은 거래 많은 쪽에 붙는다.
  const [line] = vwma([bar(100, 100), bar(200, 1)], 2).slice(-1);
  assert.ok(line < 105, `단순평균 150보다 100쪽에 붙어야 한다 (${line})`);
  assert.equal(vwma([bar(100, 1), bar(200, 1)], 2).at(-1), 150, '거래량이 같으면 단순평균과 같다');
});

test('기간을 못 채운 구간은 null로 둔다', () => {
  assert.deepEqual(vwma([bar(100, 1), bar(200, 1)], 3), [null, null]);
});

test('거래가 한 건도 없던 구간은 계산하지 않는다', () => {
  assert.equal(vwma([bar(100, 0), bar(200, 0)], 2).at(-1), null);
});

test('거래량이 없는 캔들도 터지지 않는다', () => {
  assert.equal(vwma([{ close: 100 }, { close: 200 }], 2).at(-1), null);
});

// --- 일봉으로 낸 선을 분봉에 맞추기 ---

const day = (date, close, volume = 1) => ({ date, close, volume });

test('분봉에는 그 날 직전까지 마감된 일봉으로 낸 값을 쓴다', () => {
  // 오늘 일봉은 장중이라 계속 바뀐다. 기준선으로 쓰면 판정이 흔들린다.
  const daily = [day('2026-09-18', 100), day('2026-09-19', 200), day('2026-09-20', 999)];
  const candles = [
    { timeKst: '2026-09-20T09:00:00', close: 0 },
    { timeKst: '2026-09-20T23:45:00', close: 0 },
  ];
  const line = dailyLineFor(candles, daily, 2);
  assert.deepEqual(line, [150, 150], '9/20 분봉은 9/18~9/19 일봉으로 낸 값(150)을 쓴다');
});

test('날이 바뀌면 기준선도 따라 바뀐다', () => {
  const daily = [day('2026-09-18', 100), day('2026-09-19', 200), day('2026-09-20', 300)];
  const candles = [
    { timeKst: '2026-09-20T09:00:00', close: 0 },
    { timeKst: '2026-09-21T09:00:00', close: 0 },
  ];
  assert.deepEqual(dailyLineFor(candles, daily, 2), [150, 250]);
});

test('일봉이 모자라면 기준선이 없다', () => {
  const candles = [{ timeKst: '2026-09-20T09:00:00', close: 0 }];
  assert.deepEqual(dailyLineFor(candles, [day('2026-09-19', 100)], 5), [null]);
});

// --- 돌파 판정 ---

const series = (rows) =>
  rows.map(([close, volume], i) => ({
    close, volume,
    timeUtc: `2026-09-20T${String(i).padStart(2, '0')}:00:00`,
    timeKst: `2026-09-20T${String(i).padStart(2, '0')}:00:00`,
  }));

/** 분봉 자체로 낸 선. 판정 규칙만 시험하기 위한 편의 함수다. */
const lineOf = (candles, period) => vwma(candles, period);

test('가격이 기준선을 위로 뚫으면 알린다', () => {
  // 선 아래에 있다가 마지막 봉에서 위로 넘어간다.
  const candles = series([[110, 1], [105, 1], [100, 1], [99, 1], [130, 1]]);
  const [signal] = detectBreakouts(candles, { line: lineOf(candles, 3), fromIndex: 1 });
  assert.equal(signal.type, 'breakUp');
  assert.equal(signal.candle.close, 130);
  assert.ok(signal.gapPct > 0, '선보다 위에 있다');
});

test('아래로 뚫어도 알린다', () => {
  const candles = series([[90, 1], [95, 1], [100, 1], [101, 1], [70, 1]]);
  assert.equal(detectBreakouts(candles, { line: lineOf(candles, 3), fromIndex: 1 })[0].type, 'breakDown');
});

test('뚫고 나서 계속 위에 머무는 동안에는 다시 알리지 않는다', () => {
  const candles = series([[110, 1], [105, 1], [100, 1], [99, 1], [130, 1], [140, 1], [150, 1]]);
  const types = detectBreakouts(candles, { line: lineOf(candles, 3), fromIndex: 1 }).map((s) => s.type);
  assert.deepEqual(types, ['breakUp'], '처음 뚫은 한 번만');
});

test('줄곧 선 위에 있기만 하면 뚫은 것이 아니므로 알리지 않는다', () => {
  // 꾸준히 오르는 구간은 종가가 늘 평균보다 위다. 넘어선 순간이 없으므로 신호도 없다.
  const candles = series([[100, 1], [110, 1], [120, 1], [130, 1], [140, 1]]);
  assert.deepEqual(detectBreakouts(candles, { line: lineOf(candles, 3), fromIndex: 1 }), []);
});

test('기준선이 없는 구간은 건너뛴다', () => {
  const candles = series([[100, 1], [200, 1]]);
  assert.deepEqual(detectBreakouts(candles, { line: [null, null] }), []);
});

test('이미 확인한 캔들은 다시 알리지 않는다', () => {
  const candles = series([[110, 1], [105, 1], [100, 1], [99, 1], [130, 1]]);
  assert.deepEqual(detectBreakouts(candles, { line: lineOf(candles, 3), fromIndex: 5 }), []);
});

test('확인 폭 안에서 오르내리는 잔파동은 걸러진다', () => {
  // 선을 0.1%쯤 넘나드는 움직임. 폭을 0.5%로 두면 넘어간 것으로 치지 않는다.
  const candles = series([[100, 1], [100, 1], [100, 1], [100.1, 1], [99.9, 1], [100.1, 1], [99.9, 1]]);
  const line = lineOf(candles, 3);
  assert.deepEqual(detectBreakouts(candles, { line, marginPct: 0.5, fromIndex: 1 }), []);
  assert.ok(detectBreakouts(candles, { line, marginPct: 0, fromIndex: 1 }).length > 0, '폭이 0이면 그대로 알린다');
});

test('한쪽으로 넘어가면 반대쪽으로 확실히 벗어날 때만 다시 알린다', () => {
  const candles = series([
    [110, 1], [105, 1], [100, 1], [99, 1],   // 선 아래
    [130, 1],                                 // 위로 넘어감
    [118, 1], [119, 1],                       // 선 근처로 돌아왔지만 폭 안
    [80, 1],                                  // 아래로 확실히 벗어남
  ]);
  const types = detectBreakouts(candles, { line: lineOf(candles, 3), marginPct: 1, fromIndex: 1 })
    .map((s) => s.type);
  assert.deepEqual(types, ['breakUp', 'breakDown']);
});

test('현재 상태 요약은 일봉으로 선을 내고 지금 값은 밖에서 받는다', () => {
  const daily = Array.from({ length: 30 }, (_, i) => ({
    close: 100 + i, volume: 1, timeUtc: '', timeKst: '2026-09-20T00:00:00',
  }));
  const summary = summarize(daily, { short: 5, long: 10 }, { price: 200, line: 100 });
  assert.equal(summary.price, 200, '분봉에서 받은 지금 값을 쓴다');
  assert.equal(summary.line, 100);
  assert.equal(summary.linePct, 100, '지금 값이 기준선의 두 배면 +100%');

  const bare = summarize(daily, { short: 5, long: 10 });
  assert.equal(bare.line, null, '선이 없으면 비워 둔다');
  assert.equal(bare.price, 129, '지금 값을 안 주면 마지막 일봉 종가를 쓴다');
});
