import test from 'node:test';
import assert from 'node:assert/strict';
import { periodMove, gapTrend } from '../src/report-stats.js';

const START = Date.parse('2026-09-16T00:00:00+09:00');
const at = (i) => START + i * 15 * 60_000;
const series = (closes, offset = 0) =>
  closes.map((close, i) => ({ ms: at(i + offset), close, high: close + 1, low: close - 1 }));

test('기간 시작 직전 종가를 기준으로 등락을 잰다', () => {
  const candles = [{ ms: at(-1), close: 100, high: 100, low: 100 }, ...series([110, 120])];
  const moved = periodMove(candles, START);
  assert.equal(moved.last, 120);
  assert.equal(moved.changePct, 20);
  assert.equal(moved.high, 121);
  assert.equal(moved.low, 109);
});

test('기간 앞 캔들이 없으면 기간 첫 캔들을 기준으로 삼는다', () => {
  assert.equal(periodMove(series([100, 105]), START).changePct, 5);
});

test('기간 안에 캔들이 없으면 집계하지 않는다', () => {
  assert.equal(periodMove([], START), null);
  assert.equal(periodMove([{ ms: at(-5), close: 100 }], START), null);
});

const line = (closes) => closes.map((close, i) => ({ ms: at(i), close, high: close, low: close }));
const flat = (count, value) => Array(count).fill(value);
const slope = (count, from, step) => Array.from({ length: count }, (_, i) => from + i * step);

test('가만히 있다 오르기 시작하면 두 선이 벌어진다', () => {
  const candles = line([...flat(300, 1000), ...slope(100, 1002, 2)]);
  const trend = gapTrend(candles, { short: 50, long: 200 }, at(300));
  assert.ok(trend.gapPct > 0, '50선이 200선 위');
  assert.equal(trend.closing, false, '벌어지는 중');
});

test('오르던 값이 멈추면 두 선이 다시 좁혀진다', () => {
  const candles = line([...slope(300, 1000, 2), ...flat(100, 1598)]);
  const trend = gapTrend(candles, { short: 50, long: 200 }, at(300));
  assert.ok(trend.gapPct > 0);
  assert.equal(trend.closing, true, '좁혀지는 중');
});

test('선을 그릴 캔들이 모자라면 집계하지 않는다', () => {
  assert.equal(gapTrend(series([1, 2, 3]), { short: 50, long: 200 }, START), null);
});

test('앞 기간 캔들이 모자라면 좁혀지는지는 모른다고 둔다', () => {
  const candles = line(slope(250, 1000, 2));
  assert.equal(gapTrend(candles, { short: 50, long: 200 }, at(10)).closing, null);
});
