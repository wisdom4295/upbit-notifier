import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, detectSignals, summarize } from '../src/indicators.js';

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
