import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReports, markReportSent, weekKey } from '../src/schedule.js';

// KST = UTC + 9
const kst = (iso) => Date.parse(`${iso}Z`) - 9 * 3600_000;

test('밤 10시 전에는 보내지 않는다', () => {
  assert.deepEqual(dueReports({}, kst('2026-09-16T21:59:00')), []);
});

test('밤 10시가 지나면 오늘 것을 보낸다', () => {
  assert.deepEqual(dueReports({}, kst('2026-09-16T22:00:00')), ['daily']);
});

test('이미 보낸 날은 다시 보내지 않는다', () => {
  const state = { lastDailyReport: '2026-09-16' };
  assert.deepEqual(dueReports(state, kst('2026-09-16T23:30:00')), []);
});

test('날이 바뀌면 다시 보낸다', () => {
  const state = { lastDailyReport: '2026-09-16' };
  assert.deepEqual(dueReports(state, kst('2026-09-17T22:10:00')), ['daily']);
});

test('실행이 몇 시간 건너뛰어도 늦게나마 한 번은 보낸다', () => {
  // 밤 10시를 놓치고 새벽 1시에 처음 깨어난 경우 — 날짜가 바뀌었으니 그날 것으로 처리된다
  assert.deepEqual(dueReports({ lastDailyReport: '2026-09-15' }, kst('2026-09-16T23:50:00')), ['daily']);
});

test('일요일 밤에는 주간 리포트도 함께 보낸다', () => {
  // 2026-09-20 은 일요일
  assert.deepEqual(dueReports({}, kst('2026-09-20T22:00:00')), ['daily', 'weekly']);
});

test('일요일이 아니면 주간은 보내지 않는다', () => {
  assert.deepEqual(dueReports({}, kst('2026-09-19T22:00:00')), ['daily']);
});

test('같은 주에 주간 리포트를 두 번 보내지 않는다', () => {
  const state = { lastWeeklyReport: weekKey(kst('2026-09-20T22:00:00')) };
  assert.deepEqual(dueReports(state, kst('2026-09-20T23:00:00')), ['daily']);
});

test('주 열쇠는 그 주 월요일이다', () => {
  assert.equal(weekKey(kst('2026-09-20T22:00:00')), '2026-09-14', '일요일 → 직전 월요일');
  assert.equal(weekKey(kst('2026-09-14T00:30:00')), '2026-09-14', '월요일 → 자기 자신');
});

test('보낸 기록이 남는다', () => {
  const state = markReportSent({}, 'daily', kst('2026-09-16T22:00:00'));
  assert.equal(state.lastDailyReport, '2026-09-16');
  markReportSent(state, 'weekly', kst('2026-09-20T22:00:00'));
  assert.equal(state.lastWeeklyReport, '2026-09-14');
});
