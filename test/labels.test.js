import test from 'node:test';
import assert from 'node:assert/strict';
import { signalLabel, signalName, duration } from '../src/labels.js';

const periods = { short: 50, long: 200 };

test('라벨에 설정한 기간 숫자가 그대로 들어간다', () => {
  assert.equal(signalLabel('golden', periods).brief, '50선 위로');
  assert.equal(signalLabel('golden', periods).full, '50선이 200선을 아래에서 위로 뚫었습니다.');
});

test('기간을 바꾸면 라벨도 따라간다', () => {
  assert.equal(signalLabel('dead', { short: 20, long: 60 }).brief, '20선 아래로');
});

test('세 신호가 서로 다른 이모지를 쓴다', () => {
  const emojis = ['golden', 'dead', 'proximity'].map((t) => signalLabel(t, periods).emoji);
  assert.equal(new Set(emojis).size, 3);
});

test('모르는 종류는 그대로 돌려주고 터지지 않는다', () => {
  assert.equal(signalLabel('unknown', periods).brief, 'unknown');
  assert.equal(signalName('unknown', periods), 'unknown');
});

test('표시용 이름은 이모지를 앞에 붙인다', () => {
  assert.equal(signalName('proximity', periods), '🟡 50선 근접');
});

test('봉 수를 사람이 읽는 시간으로 바꾼다', () => {
  assert.equal(duration(50, 15), '12.5시간');
  assert.equal(duration(200, 15), '2.1일');
  assert.equal(duration(3, 15), '45분');
  assert.equal(duration(4, 15), '1시간');
});
