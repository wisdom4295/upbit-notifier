import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatReport } from '../src/report.js';
import { readSignals, appendSignals } from '../src/history.js';

const periods = { short: 50, long: 200, unit: 15 };
const range = { from: '2026-09-16T00:00:00', to: '2026-09-17T00:00:00', label: '2026-09-16' };

const signal = (kst, type, market, returns = {}) => ({
  ts: kst, kst, market, type, price: 100, short: 101, long: 100, gapPct: 1, unit: 15,
  returns: { 1: null, 4: null, 24: null, ...returns },
});

test('알림이 없으면 없다고 알린다', () => {
  const text = formatReport('daily', range, [], periods);
  assert.match(text, /오늘 알림 정리/);
  assert.match(text, /알림이 없습니다/);
});

test('건수와 종류를 요약한다', () => {
  const text = formatReport('daily', range, [
    signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC'),
    signal('2026-09-16T10:00:00', 'dead', 'KRW-ETH'),
    signal('2026-09-16T11:00:00', 'golden', 'KRW-XRP'),
  ], periods);
  assert.match(text, /알림 <b>3건<\/b>/);
  assert.match(text, /위로 2/);
  assert.match(text, /아래로 1/);
  assert.match(text, /근접 0/);
});

test('주간 리포트는 제목이 다르다', () => {
  assert.match(formatReport('weekly', range, [], periods), /이번 주 알림 정리/);
});

test('아직 시간이 지나지 않은 성과는 —로 적는다', () => {
  const text = formatReport('daily', range, [signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC')], periods);
  assert.match(text, /하루 —/);
});

test('성과가 있으면 부호와 함께 보여 준다', () => {
  const text = formatReport('daily', range, [
    signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC', { 1: 1.234, 24: -2.5 }),
  ], periods);
  assert.match(text, /1시간 \+1.23%/);
  assert.match(text, /하루 -2.5%/);
});

test('최신 알림이 위로 온다', () => {
  const text = formatReport('daily', range, [
    signal('2026-09-16T09:00:00', 'golden', 'KRW-BTC'),
    signal('2026-09-16T20:00:00', 'dead', 'KRW-ETH'),
  ], periods);
  assert.ok(text.indexOf('ETH') < text.indexOf('BTC'), '늦게 온 ETH가 먼저 보인다');
});

test('건수가 많으면 목록을 줄이고 남은 수를 알린다', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    signal(`2026-09-16T${String(i % 24).padStart(2, '0')}:00:00`, 'golden', 'KRW-BTC'));
  const text = formatReport('daily', range, many, periods);
  assert.match(text, /외 15건/);
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
