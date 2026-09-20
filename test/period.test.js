import test from 'node:test';
import assert from 'node:assert/strict';
import { kstDate, todayRange, weekRange } from '../src/period.js';

// 2026-09-15 14:30 KST = 2026-09-15 05:30 UTC (화요일)
const TUESDAY_KST_AFTERNOON = Date.parse('2026-09-15T05:30:00Z');

test('KST 날짜는 UTC보다 9시간 앞선다', () => {
  assert.equal(kstDate(TUESDAY_KST_AFTERNOON), '2026-09-15');
  // UTC로는 14일 23시지만 KST로는 이미 15일 아침
  assert.equal(kstDate(Date.parse('2026-09-14T23:00:00Z')), '2026-09-15');
});

test('오늘 범위는 KST 자정부터 다음 자정까지다', () => {
  assert.deepEqual(todayRange(TUESDAY_KST_AFTERNOON), {
    from: '2026-09-15T00:00:00',
    to: '2026-09-16T00:00:00',
    label: '2026-09-15',
  });
});

test('이번 주는 월요일에 시작한다', () => {
  const range = weekRange(TUESDAY_KST_AFTERNOON); // 화요일 기준
  assert.equal(range.from, '2026-09-14T00:00:00', '직전 월요일');
  assert.equal(range.to, '2026-09-21T00:00:00');
});

test('일요일은 이전 월요일이 속한 주로 친다', () => {
  const sunday = Date.parse('2026-09-20T03:00:00Z'); // 2026-09-20 12시 KST, 일요일
  assert.equal(weekRange(sunday).from, '2026-09-14T00:00:00');
});

test('월요일 자정 직후는 그날이 주 시작이다', () => {
  const monday = Date.parse('2026-09-13T15:30:00Z'); // 2026-09-14 00:30 KST
  assert.equal(weekRange(monday).from, '2026-09-14T00:00:00');
});
