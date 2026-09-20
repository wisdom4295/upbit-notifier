import test from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, lastDayRange, lastWeekRange } from '../src/period.js';

// 2026-09-15 14:30 KST = 2026-09-15 05:30 UTC (화요일)
const TUESDAY_KST_AFTERNOON = Date.parse('2026-09-15T05:30:00Z');

test('KST 날짜는 UTC보다 9시간 앞선다', () => {
  assert.equal(kstDate(TUESDAY_KST_AFTERNOON), '2026-09-15');
  // UTC로는 14일 23시지만 KST로는 이미 15일 아침
  assert.equal(kstDate(Date.parse('2026-09-14T23:00:00Z')), '2026-09-15');
});

test('마감된 하루는 어제 자정부터 오늘 자정까지다', () => {
  assert.deepEqual(lastDayRange(TUESDAY_KST_AFTERNOON), {
    from: '2026-09-14T00:00:00',
    to: '2026-09-15T00:00:00',
    label: '2026-09-14',
  });
});

test('자정 직후에는 방금 끝난 하루를 가리킨다', () => {
  const justAfterMidnight = Date.parse('2026-09-16T15:02:00Z'); // 2026-09-17 00:02 KST
  assert.equal(lastDayRange(justAfterMidnight).label, '2026-09-16');
});

test('마감된 한 주는 지난 월요일부터 이번 월요일까지다', () => {
  const range = lastWeekRange(TUESDAY_KST_AFTERNOON); // 9/15 화요일 기준
  assert.equal(range.from, '2026-09-07T00:00:00', '지지난 월요일');
  assert.equal(range.to, '2026-09-14T00:00:00');
  assert.equal(range.label, '2026-09-07 ~ 2026-09-13');
});

test('월요일 자정 직후에는 방금 끝난 한 주를 가리킨다', () => {
  const monday = Date.parse('2026-09-20T15:05:00Z'); // 2026-09-21 00:05 KST, 월요일
  assert.equal(lastWeekRange(monday).label, '2026-09-14 ~ 2026-09-20');
});
