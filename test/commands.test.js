import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, applyCommand, MAX_MARKETS } from '../src/commands.js';

const context = (markets, extra = {}) => ({
  markets,
  availableMarkets: ['KRW-BTC', 'KRW-ETH', 'KRW-DOGE', 'KRW-XRP'],
  ...extra,
});

test('명령이 아니면 무시한다', () => {
  assert.equal(parseCommand('안녕하세요'), null);
  assert.equal(parseCommand(''), null);
  assert.equal(parseCommand('/'), null);
});

test('그룹에서 오는 /add@봇이름 도 해석한다', () => {
  assert.deepEqual(parseCommand('/add@kang_upbit_alert_bot doge'), { name: 'add', arg: 'doge' });
});

test('대소문자와 앞뒤 공백을 가리지 않는다', () => {
  assert.deepEqual(parseCommand('  /LIST  '), { name: 'list', arg: '' });
});

test('코인 기호만 적어도 KRW 마켓으로 붙여 준다', () => {
  const result = applyCommand({ name: 'add', arg: 'doge' }, context(['KRW-BTC']));
  assert.deepEqual(result.markets, ['KRW-BTC', 'KRW-DOGE']);
  assert.equal(result.changed, true);
});

test('마켓 코드를 그대로 적어도 된다', () => {
  const result = applyCommand({ name: 'add', arg: 'KRW-DOGE' }, context([]));
  assert.deepEqual(result.markets, ['KRW-DOGE']);
});

test('업비트에 없는 코인은 거절하고 목록을 그대로 둔다', () => {
  const result = applyCommand({ name: 'add', arg: 'NOSUCH' }, context(['KRW-BTC']));
  assert.equal(result.changed, false);
  assert.deepEqual(result.markets, ['KRW-BTC']);
  assert.match(result.reply, /없습니다/);
});

test('업비트 목록을 못 받았으면 검사를 건너뛴다', () => {
  const result = applyCommand({ name: 'add', arg: 'DOGE' }, { markets: [], availableMarkets: [] });
  assert.equal(result.changed, true);
});

test('이미 있는 코인은 다시 넣지 않는다', () => {
  const result = applyCommand({ name: 'add', arg: 'BTC' }, context(['KRW-BTC']));
  assert.equal(result.changed, false);
  assert.deepEqual(result.markets, ['KRW-BTC']);
});

test('코인 수 상한을 넘기지 않는다', () => {
  const full = Array.from({ length: MAX_MARKETS }, (_, i) => `KRW-C${i}`);
  const result = applyCommand({ name: 'add', arg: 'DOGE' }, context(full));
  assert.equal(result.changed, false);
  assert.match(result.reply, new RegExp(`${MAX_MARKETS}개`));
});

test('빼기는 목록에서 지운다', () => {
  const result = applyCommand({ name: 'remove', arg: 'xrp' }, context(['KRW-BTC', 'KRW-XRP']));
  assert.deepEqual(result.markets, ['KRW-BTC']);
  assert.equal(result.changed, true);
});

test('없는 코인을 빼려 하면 알려 준다', () => {
  const result = applyCommand({ name: 'remove', arg: 'DOGE' }, context(['KRW-BTC']));
  assert.equal(result.changed, false);
  assert.match(result.reply, /목록에 없습니다/);
});

test('마지막 코인을 빼면 비었다고 알려 준다', () => {
  const result = applyCommand({ name: 'remove', arg: 'BTC' }, context(['KRW-BTC']));
  assert.deepEqual(result.markets, []);
  assert.match(result.reply, /없습니다/);
});

test('인자 없이 add/remove 하면 사용법을 알려 준다', () => {
  assert.match(applyCommand({ name: 'add', arg: '' }, context([])).reply, /예: \/add/);
  assert.match(applyCommand({ name: 'remove', arg: '' }, context([])).reply, /예: \/remove/);
});

test('목록 보기는 코인 기호만 보여 준다', () => {
  const reply = applyCommand({ name: 'list', arg: '' }, context(['KRW-BTC', 'KRW-ETH'])).reply;
  assert.match(reply, /BTC/);
  assert.ok(!reply.includes('KRW-'), 'KRW- 접두어는 빼고 보여 준다');
});

test('빈 목록도 안내한다', () => {
  assert.match(applyCommand({ name: 'list', arg: '' }, context([])).reply, /없습니다/);
});

test('/id 는 방 번호를 돌려준다', () => {
  const reply = applyCommand({ name: 'id', arg: '' }, context([], { chatId: -1001234 })).reply;
  assert.match(reply, /-1001234/);
});

test('모르는 명령에는 도움말을 붙인다', () => {
  const reply = applyCommand({ name: 'ㅁㄴㅇㄹ', arg: '' }, context([])).reply;
  assert.match(reply, /모르는 명령/);
  assert.match(reply, /\/add/);
});

test('/status 는 답장을 호출한 쪽에 맡긴다', () => {
  assert.equal(applyCommand({ name: 'status', arg: '' }, context([])).reply, null);
});
