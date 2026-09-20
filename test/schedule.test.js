import test from 'node:test';
import assert from 'node:assert/strict';
import { dueReports, markReportSent, weekKey } from '../src/schedule.js';

// KST = UTC + 9
const kst = (iso) => Date.parse(`${iso}Z`) - 9 * 3600_000;

test('자정을 넘기면 방금 끝난 하루를 보낸다', () => {
  // 9/17 00:05 → 9/16 이 막 마감됐다
  assert.deepEqual(dueReports({}, kst('2026-09-17T00:05:00')), ['daily']);
});

test('이미 보낸 하루는 다시 보내지 않는다', () => {
  const state = { lastDailyReport: '2026-09-16' };
  assert.deepEqual(dueReports(state, kst('2026-09-17T00:30:00')), []);
  assert.deepEqual(dueReports(state, kst('2026-09-17T15:00:00')), [], '그날 내내 조용하다');
});

test('다음 자정이 오면 그다음 하루를 보낸다', () => {
  const state = { lastDailyReport: '2026-09-16' };
  assert.deepEqual(dueReports(state, kst('2026-09-18T00:02:00')), ['daily']);
});

test('실행이 반나절 건너뛰어도 늦게나마 한 번은 보낸다', () => {
  // 자정에 못 깨어나 아침 9시에 처음 돈 경우
  assert.deepEqual(dueReports({ lastDailyReport: '2026-09-15' }, kst('2026-09-17T09:00:00')), ['daily']);
});

test('월요일에는 방금 끝난 한 주도 함께 보낸다', () => {
  // 2026-09-21 은 월요일. 9/14~9/20 한 주가 막 끝났다.
  assert.deepEqual(dueReports({}, kst('2026-09-21T00:05:00')), ['daily', 'weekly']);
});

test('월요일이 아니면 주간은 보내지 않는다', () => {
  assert.deepEqual(dueReports({}, kst('2026-09-20T00:05:00')), ['daily'], '일요일 자정');
});

test('같은 주에 주간 리포트를 두 번 보내지 않는다', () => {
  const state = { lastWeeklyReport: '2026-09-14' };
  assert.deepEqual(dueReports(state, kst('2026-09-21T06:00:00')), ['daily']);
});

test('hour를 주면 그 시각 전에는 보내지 않는다', () => {
  assert.deepEqual(dueReports({}, kst('2026-09-17T00:30:00'), { hour: 2 }), []);
  assert.deepEqual(dueReports({}, kst('2026-09-17T02:00:00'), { hour: 2 }), ['daily']);
});

test('주 열쇠는 그 주 월요일이다', () => {
  assert.equal(weekKey(kst('2026-09-20T22:00:00')), '2026-09-14', '일요일 → 직전 월요일');
  assert.equal(weekKey(kst('2026-09-14T00:30:00')), '2026-09-14', '월요일 → 자기 자신');
});

test('보낸 기록은 정리한 기간으로 남는다', () => {
  const state = markReportSent({}, 'daily', kst('2026-09-17T00:05:00'));
  assert.equal(state.lastDailyReport, '2026-09-16', '보낸 날이 아니라 정리한 날');

  markReportSent(state, 'weekly', kst('2026-09-21T00:05:00'));
  assert.equal(state.lastWeeklyReport, '2026-09-14', '막 끝난 주의 월요일');
});
