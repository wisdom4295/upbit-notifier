import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPositions, summarizePortfolio, withinRange } from '../src/portfolio.js';

const trade = (ts, side, price, quantity, market = 'KRW-BTC') => ({
  id: ts, ts, market, side, price, quantity,
});

test('매수만 있으면 평단은 가중평균이다', () => {
  const { positions, realizedPnl } = buildPositions([
    trade('2026-09-01T00:00:00Z', 'buy', 100, 1),
    trade('2026-09-02T00:00:00Z', 'buy', 200, 3),
  ]);
  assert.equal(positions['KRW-BTC'].quantity, 4);
  assert.equal(positions['KRW-BTC'].avgPrice, 175); // (100 + 600) / 4
  assert.equal(realizedPnl, 0);
});

test('매도는 평단 기준으로 실현손익을 만든다', () => {
  const { positions, realizedPnl } = buildPositions([
    trade('2026-09-01T00:00:00Z', 'buy', 100, 2),
    trade('2026-09-03T00:00:00Z', 'sell', 150, 1),
  ]);
  assert.equal(realizedPnl, 50);
  assert.equal(positions['KRW-BTC'].quantity, 1);
  assert.equal(positions['KRW-BTC'].avgPrice, 100, '일부 매도해도 평단은 유지된다');
});

test('입력 순서가 뒤섞여도 체결 시각 순으로 계산한다', () => {
  const shuffled = buildPositions([
    trade('2026-09-03T00:00:00Z', 'sell', 150, 1),
    trade('2026-09-01T00:00:00Z', 'buy', 100, 2),
  ]);
  assert.equal(shuffled.realizedPnl, 50);
});

test('전량 매도하면 보유수량과 원가가 0이 된다', () => {
  const { positions, realizedPnl } = buildPositions([
    trade('2026-09-01T00:00:00Z', 'buy', 100, 3),
    trade('2026-09-02T00:00:00Z', 'sell', 120, 3),
  ]);
  assert.equal(realizedPnl, 60);
  assert.equal(positions['KRW-BTC'].quantity, 0);
  assert.equal(positions['KRW-BTC'].cost, 0);
});

test('보유수량보다 많이 판 기록은 보유분까지만 반영하고 경고한다', () => {
  const { positions, realizedPnl, warnings } = buildPositions([
    trade('2026-09-01T00:00:00Z', 'buy', 100, 1),
    trade('2026-09-02T00:00:00Z', 'sell', 150, 5),
  ]);
  assert.equal(realizedPnl, 50, '보유한 1개만 실현된다');
  assert.equal(positions['KRW-BTC'].quantity, 0);
  assert.equal(warnings.length, 1);
});

test('코인별로 따로 집계한다', () => {
  const { positions } = buildPositions([
    trade('2026-09-01T00:00:00Z', 'buy', 100, 1, 'KRW-BTC'),
    trade('2026-09-01T00:00:00Z', 'buy', 50, 2, 'KRW-ETH'),
  ]);
  assert.equal(positions['KRW-BTC'].avgPrice, 100);
  assert.equal(positions['KRW-ETH'].avgPrice, 50);
});

test('현재가를 주면 평가손익을 계산한다', () => {
  const result = summarizePortfolio(
    [trade('2026-09-01T00:00:00Z', 'buy', 100, 2)],
    { 'KRW-BTC': 130 },
  );
  assert.equal(result.unrealizedPnl, 60);
  assert.equal(result.holdingValue, 260);
  assert.equal(result.rows[0].returnPct, 30);
});

test('현재가가 없으면 평가손익은 null로 두고 합계에서 뺀다', () => {
  const result = summarizePortfolio([trade('2026-09-01T00:00:00Z', 'buy', 100, 2)], {});
  assert.equal(result.rows[0].unrealizedPnl, null);
  assert.equal(result.unrealizedPnl, 0);
});

test('withinRange는 시작은 포함하고 끝은 제외한다', () => {
  const items = [{ ts: '2026-09-01' }, { ts: '2026-09-02' }, { ts: '2026-09-03' }];
  const result = withinRange(items, '2026-09-01', '2026-09-03');
  assert.deepEqual(result.map((i) => i.ts), ['2026-09-01', '2026-09-02']);
});

test('실현손익 이벤트에 발생 시각이 남아 기간별 집계가 가능하다', () => {
  const { realizedEvents } = buildPositions([
    trade('2026-09-01T00:00:00Z', 'buy', 100, 3),
    trade('2026-09-02T00:00:00Z', 'sell', 120, 1),
    trade('2026-09-09T00:00:00Z', 'sell', 90, 1),
  ]);
  assert.deepEqual(realizedEvents.map((e) => [e.ts, e.profit]), [
    ['2026-09-02T00:00:00Z', 20],
    ['2026-09-09T00:00:00Z', -10],
  ]);

  const thisWeek = withinRange(realizedEvents, '2026-09-07T00:00:00Z', '2026-09-14T00:00:00Z');
  assert.equal(thisWeek.reduce((sum, e) => sum + e.profit, 0), -10);
});
