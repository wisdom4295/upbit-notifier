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

test('아직 하루가 지나지 않은 성과는 —로 적는다', () => {
  assert.match(report('daily', [signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC')]), /하루 —/);
});

test('성과는 ▲▼로 보여 준다', () => {
  const text = report('daily', [signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC', { 1: 1.234, 24: -2.5 })]);
  assert.match(text, /1시간 ▲1.23%/);
  assert.match(text, /하루 ▼2.5%/);
});

test('신호가 맞았는지 세어 준다', () => {
  const text = report('daily', [
    signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC', { 24: 3 }),
    signal('2026-09-16T10:00:00', 'golden', 'KRW-ETH', { 24: -1 }),
    signal('2026-09-16T11:00:00', 'dead', 'KRW-XRP', { 24: -2 }),
  ]);
  assert.match(text, /신호가 맞았나/);
  assert.match(text, /2건 중 <b>1건 맞음<\/b>/, '위로 신호 2건 중 1건');
  assert.match(text, /1건 중 <b>1건 맞음<\/b>/, '아래로 신호 1건 중 1건');
});

test('아직 하루가 안 지난 건은 집계에서 빼고 그 사실을 알린다', () => {
  const text = report('daily', [
    signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC', { 24: 3 }),
    signal('2026-09-16T10:00:00', 'golden', 'KRW-ETH'),
  ]);
  assert.match(text, /1건은 아직 하루가 안 지나/);
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
