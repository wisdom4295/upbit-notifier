import test from 'node:test';
import assert from 'node:assert/strict';
import { byType, overview } from '../src/review-stats.js';

const signal = (type, market, r1, r4, r24) => ({
  type, market, returns: { 1: r1, 4: r4, 24: r24 },
});

const sample = [
  signal('golden', 'KRW-BTC', 1, 2, 4),
  signal('golden', 'KRW-ETH', 3, 4, 6),
  signal('dead', 'KRW-BTC', -1, -2, null),
];

test('요약은 종류별 건수와 전체 평균을 낸다', () => {
  const result = overview(sample);
  assert.equal(result.total, 3);
  assert.deepEqual(result.counts, { golden: 2, dead: 1, proximity: 0 });
  assert.equal(result.returns[1], 1); // (1 + 3 - 1) / 3
});

test('아직 시간이 지나지 않은 성과는 평균에서 뺀다', () => {
  const result = overview(sample);
  assert.equal(result.returns[24], 5, 'null인 24h는 제외하고 (4 + 6) / 2');
});

test('성과가 하나도 없으면 평균은 null', () => {
  const result = overview([signal('golden', 'KRW-BTC', null, null, null)]);
  assert.equal(result.returns[1], null);
});

test('신호 종류별로 나눠 집계한다', () => {
  const rows = byType(sample);
  assert.deepEqual(rows.map((r) => [r.type, r.count]), [['golden', 2], ['dead', 1]]);
  assert.equal(rows[0].returns[1], 2); // (1 + 3) / 2
});

test('건수가 0인 종류는 빼고 보여 준다', () => {
  assert.equal(byType(sample).some((row) => row.type === 'proximity'), false);
});

test('신호가 없으면 빈 집계', () => {
  assert.deepEqual(byType([]), []);
  assert.equal(overview([]).total, 0);
});
