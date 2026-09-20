import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatReport } from '../src/report.js';
import { readSignals, appendSignals } from '../src/history.js';

const periods = { short: 50, long: 200 };
const range = { from: '2026-09-16T00:00:00', to: '2026-09-17T00:00:00', label: '2026-09-16' };

const signal = (kst, type, market, returns = {}) => ({
  ts: kst, kst, market, type, price: 100, short: 101, long: 100, gapPct: 1, unit: 15,
  returns: { 1: null, 4: null, 24: null, ...returns },
});

const report = (period, signals, extra = {}) =>
  formatReport(period, range, { markets: [], series: new Map(), signals, periods, unit: 15, ...extra });

const candles = (closes, startMs = Date.parse('2026-09-16T00:00:00+09:00')) =>
  closes.map((close, i) => ({ ms: startMs + i * 15 * 60_000, close, high: close, low: close }));

test('제목에 날짜와 기준을 적는다', () => {
  const text = report('daily', []);
  assert.match(text, /9월 16일/);
  assert.match(text, /50선 \/ 200선/);
  assert.ok(!text.includes('거래량'), '거래량선을 안 쓰면 제목에도 없다');
});

test('거래량선을 쓰면 제목에도 적는다', () => {
  const text = formatReport('daily', range, {
    markets: [], series: new Map(), signals: [],
    periods: { short: 50, long: 200, vwma: 100 }, unit: 15,
  });
  assert.match(text, /50선 \/ 200선 · 거래량 100선/);
});

test('주간 리포트는 제목이 다르다', () => {
  assert.match(report('weekly', []), /주간 정리/);
});

test('알림이 없으면 없다고 알린다', () => {
  const text = report('daily', []);
  assert.match(text, /온 알림/);
  assert.match(text, /없습니다/);
});

test('기간 동안 얼마나 움직였는지 먼저 보여 준다', () => {
  // 첫 캔들은 기간 직전이라 기준가가 되고, 나머지 셋이 오늘 움직임이 된다.
  const series = new Map([['KRW-BTC', candles([100, 120, 90, 110], Date.parse('2026-09-16T00:00:00+09:00') - 15 * 60_000)]]);
  const text = report('daily', [], { markets: ['KRW-BTC'], series });
  assert.match(text, /오늘 움직임/);
  assert.match(text, /▲/, '기준가보다 오르면 ▲');
  assert.match(text, /오늘 90 ~ 120/);
});

test('시세를 못 받은 코인은 그렇다고 적는다', () => {
  const text = report('daily', [], { markets: ['KRW-BTC'], series: new Map([['KRW-BTC', []]]) });
  assert.match(text, /시세를 받지 못했습니다/);
});

test('아직 그 시각이 오지 않은 것은 한 줄로 모아 "아직"이라 적는다', () => {
  const text = report('daily', [signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC')]);
  assert.match(text, /1시간 뒤·4시간 뒤·하루 뒤는 아직/);
  assert.ok(!text.includes('—'), '읽는 사람이 뜻을 짐작해야 하는 기호는 쓰지 않는다');
});

test('알림 뒤 값은 그때 가격과 등락을 함께 적는다', () => {
  // price 100 에서 1시간 뒤 1.234% 올랐으면 101.234원
  const text = report('daily', [signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC', { 1: 1.234, 24: -2.5 })]);
  assert.match(text, /1시간 뒤 101.234원 \(▲1.23%\)/);
  assert.match(text, /하루 뒤 97.5원 \(▼2.5%\)/);
  assert.match(text, /4시간 뒤는 아직/, '빠진 것만 따로 모은다');
});


test('최신 알림이 위로 온다', () => {
  const text = report('daily', [
    signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC'),
    signal('2026-09-16T20:00:00', 'dead', 'KRW-ETH'),
  ]);
  assert.ok(text.indexOf('ETH') < text.indexOf('BTC'), '늦게 온 ETH가 먼저 보인다');
});

test('건수가 많으면 목록을 줄이고 남은 수를 알린다', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    signal(`2026-09-16T${String(i % 24).padStart(2, '0')}:00:00`, 'golden', 'KRW-BTC'));
  const text = report('daily', many);
  assert.match(text, /외 20건/);
  assert.ok(text.length < 4096, '텔레그램 한 통 제한 안에 들어온다');
});

test('기간 밖의 기록은 읽지 않는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'report-'));
  await appendSignals([
    { ...signal('2026-09-15T23:00:00', 'golden', 'KRW-BTC'), ts: '2026-09-15T14:00:00' },
    { ...signal('2026-09-16T09:00:00', 'dead', 'KRW-ETH'), ts: '2026-09-16T00:00:00' },
  ], dir);

  const found = await readSignals(range, dir);
  assert.equal(found.length, 1);
  assert.equal(found[0].market, 'KRW-ETH');
});

test('이력 파일이 없으면 빈 목록', async () => {
  assert.deepEqual(await readSignals(range, await mkdtemp(join(tmpdir(), 'report-'))), []);
});

test('달이 바뀌는 기간도 양쪽 파일을 읽는다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'report-'));
  await appendSignals([
    { ...signal('2026-08-31T23:00:00', 'golden', 'KRW-BTC'), ts: '2026-08-31T14:00:00' },
    { ...signal('2026-09-01T09:00:00', 'dead', 'KRW-ETH'), ts: '2026-09-01T00:00:00' },
  ], dir);

  const found = await readSignals({ from: '2026-08-31T00:00:00', to: '2026-09-02T00:00:00' }, dir);
  assert.deepEqual(found.map((s) => s.market), ['KRW-BTC', 'KRW-ETH']);
});


test('거래량선 돌파도 알림 목록에 그대로 나온다', () => {
  const breakout = { ...signal('2026-09-16T21:30:00', 'breakUp', 'KRW-BTC'), line: 103_200_000 };
  const text = formatReport('daily', range, {
    markets: [], series: new Map(), signals: [breakout],
    periods: { short: 50, long: 200, vwma: 100 }, unit: 15,
  });
  assert.match(text, /🟢 거래량 100선 위로/);
});
