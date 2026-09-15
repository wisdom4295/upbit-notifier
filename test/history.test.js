import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendSignals, monthKey } from '../src/history.js';

const signal = (ts, market = 'KRW-BTC', type = 'golden') => ({
  ts, kst: ts, market, type, price: 100, short: 99, long: 98, gapPct: 1, unit: 15,
});

const tempDir = () => mkdtemp(join(tmpdir(), 'history-'));
const readMonth = async (dir, month) => JSON.parse(await readFile(join(dir, `${month}.json`), 'utf8'));

test('monthKey는 UTC 시각에서 연-월만 뽑는다', () => {
  assert.equal(monthKey('2026-09-15T14:30:00'), '2026-09');
});

test('빈 배열이면 아무것도 쓰지 않는다', async () => {
  assert.equal(await appendSignals([], await tempDir()), 0);
});

test('시그널을 월별 파일로 나눠 기록한다', async () => {
  const dir = await tempDir();
  const added = await appendSignals(
    [signal('2026-08-31T23:45:00'), signal('2026-09-01T00:00:00')],
    dir,
  );
  assert.equal(added, 2);
  assert.equal((await readMonth(dir, '2026-08')).length, 1);
  assert.equal((await readMonth(dir, '2026-09')).length, 1);
});

test('같은 시그널을 다시 넣어도 중복되지 않는다', async () => {
  const dir = await tempDir();
  await appendSignals([signal('2026-09-01T00:00:00')], dir);
  const again = await appendSignals([signal('2026-09-01T00:00:00')], dir);
  assert.equal(again, 0);
  assert.equal((await readMonth(dir, '2026-09')).length, 1);
});

test('같은 시각이라도 코인이나 종류가 다르면 각각 기록한다', async () => {
  const dir = await tempDir();
  await appendSignals(
    [
      signal('2026-09-01T00:00:00', 'KRW-BTC', 'golden'),
      signal('2026-09-01T00:00:00', 'KRW-ETH', 'golden'),
      signal('2026-09-01T00:00:00', 'KRW-BTC', 'proximity'),
    ],
    dir,
  );
  assert.equal((await readMonth(dir, '2026-09')).length, 3);
});

test('기존 기록에 이어 붙이고 시각 순으로 정렬한다', async () => {
  const dir = await tempDir();
  await appendSignals([signal('2026-09-05T00:00:00')], dir);
  await appendSignals([signal('2026-09-02T00:00:00')], dir);
  const records = await readMonth(dir, '2026-09');
  assert.deepEqual(records.map((r) => r.ts), ['2026-09-02T00:00:00', '2026-09-05T00:00:00']);
});

test('index.json에 사용 가능한 달 목록을 남긴다', async () => {
  const dir = await tempDir();
  await appendSignals([signal('2026-08-31T23:45:00'), signal('2026-09-01T00:00:00')], dir);
  const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
  assert.deepEqual(index.months, ['2026-08', '2026-09']);
  assert.ok(index.updatedUtc);
});
