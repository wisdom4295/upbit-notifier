import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, interpret, applyCommand, MAX_MARKETS, MAX_CHOICES, PENDING_TTL_MS } from '../src/commands.js';

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
  assert.match(result.reply, /찾지 못했습니다/);
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
  assert.match(result.reply, /알림 받는 코인에 없습니다/);
});

test('마지막 코인을 빼면 비었다고 알려 준다', () => {
  const result = applyCommand({ name: 'remove', arg: 'BTC' }, context(['KRW-BTC']));
  assert.deepEqual(result.markets, []);
  assert.match(result.reply, /알림 받는 코인이 없습니다/);
});

test('인자 없이 add 하면 사용법을 알려 준다', () => {
  assert.match(applyCommand({ name: 'add', arg: '' }, context([])).reply, /예: \/add/);
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


// --- 번호로 고르기 ---

const upbit = [
  { market: 'KRW-BTC', koreanName: '비트코인' },
  { market: 'KRW-ETH', koreanName: '이더리움' },
  { market: 'KRW-ETC', koreanName: '이더리움클래식' },
  { market: 'KRW-DOGE', koreanName: '도지코인' },
  { market: 'KRW-XRP', koreanName: '리플' },
];
const named = (markets, extra = {}) => ({ markets, availableMarkets: upbit, now: 1_000_000, ...extra });

test('이름 일부만 적으면 후보를 번호로 보여 주고 아직 넣지 않는다', () => {
  const result = applyCommand({ name: 'add', arg: '이더' }, named([]));
  assert.equal(result.changed, false);
  assert.deepEqual(result.markets, []);
  assert.match(result.reply, /1\. 이더리움 \(ETH\)/);
  assert.match(result.reply, /2\. 이더리움클래식 \(ETC\)/);
  assert.equal(result.pending.action, 'add');
  assert.equal(result.pending.options.length, 2);
});

test('보여 준 번호를 보내면 그 코인을 넣는다', () => {
  const asked = applyCommand({ name: 'add', arg: '이더' }, named([]));
  const picked = applyCommand({ name: 'select', arg: '2' }, named([], { pending: asked.pending }));
  assert.deepEqual(picked.markets, ['KRW-ETC']);
  assert.match(picked.reply, /이더리움클래식 \(ETC\) 추가했습니다/);
  assert.equal(picked.pending, null, '고르고 나면 목록을 지운다');
});

test('정확한 기호나 이름은 번호를 묻지 않고 바로 넣는다', () => {
  assert.deepEqual(applyCommand({ name: 'add', arg: 'DOGE' }, named([])).markets, ['KRW-DOGE']);
  assert.deepEqual(applyCommand({ name: 'add', arg: '이더리움' }, named([])).markets, ['KRW-ETH']);
});

test('목록에 없는 번호는 다시 물어보고 목록을 지우지 않는다', () => {
  const asked = applyCommand({ name: 'add', arg: '이더' }, named([]));
  const picked = applyCommand({ name: 'select', arg: '9' }, named([], { pending: asked.pending }));
  assert.equal(picked.changed, false);
  assert.equal(picked.pending, undefined, '목록은 그대로 둔다');
  assert.match(picked.reply, /1 ~ 2/);
});

test('오래된 목록의 번호는 받지 않는다', () => {
  const asked = applyCommand({ name: 'add', arg: '이더' }, named([]));
  const late = applyCommand(
    { name: 'select', arg: '1' },
    named([], { pending: asked.pending, now: 1_000_000 + PENDING_TTL_MS + 1 }),
  );
  assert.equal(late.changed, false);
  assert.equal(late.pending, null);
  assert.match(late.reply, /다시 찾아/);
});

test('후보가 너무 많으면 번호 대신 더 적어 달라고 한다', () => {
  const many = Array.from({ length: MAX_CHOICES + 1 }, (_, i) => ({ market: `KRW-C${i}`, koreanName: `무슨코인${i}` }));
  const result = applyCommand({ name: 'add', arg: '무슨' }, { markets: [], availableMarkets: many });
  assert.equal(result.changed, false);
  assert.equal(result.pending, undefined);
  assert.match(result.reply, /더 적어/);
});

test('/remove 만 보내면 받는 코인을 번호로 보여 준다', () => {
  const result = applyCommand({ name: 'remove', arg: '' }, named(['KRW-BTC', 'KRW-XRP']));
  assert.match(result.reply, /1\. 비트코인 \(BTC\)/);
  assert.match(result.reply, /2\. 리플 \(XRP\)/);

  const picked = applyCommand({ name: 'select', arg: '1' }, named(['KRW-BTC', 'KRW-XRP'], { pending: result.pending }));
  assert.deepEqual(picked.markets, ['KRW-XRP']);
});

test('/cancel 은 고르던 목록을 지운다', () => {
  const asked = applyCommand({ name: 'add', arg: '이더' }, named([]));
  const cancelled = applyCommand({ name: 'cancel', arg: '' }, named([], { pending: asked.pending }));
  assert.equal(cancelled.pending, null);
  assert.match(cancelled.reply, /그만뒀습니다/);
});

test('번호만 적은 말은 고를 목록이 있을 때만 명령으로 친다', () => {
  assert.equal(interpret('2', { hasPending: false }), null);
  assert.deepEqual(interpret('2', { hasPending: true }), { name: 'select', arg: '2' });
  assert.deepEqual(interpret('2번', { hasPending: true }), { name: 'select', arg: '2' });
  assert.deepEqual(interpret('/2', { hasPending: false }), { name: 'select', arg: '2' });
  assert.equal(interpret('오늘 2번 샀어', { hasPending: true }), null);
  assert.deepEqual(interpret('/list', { hasPending: true }), { name: 'list', arg: '' });
});

test('고를 목록이 없는데 번호를 보내면 안내만 한다', () => {
  const result = applyCommand({ name: 'select', arg: '1' }, named([]));
  assert.equal(result.changed, false);
  assert.match(result.reply, /먼저 \/add/);
});

test('목록 보기는 한글 이름을 같이 보여 준다', () => {
  const reply = applyCommand({ name: 'list', arg: '' }, named(['KRW-BTC'])).reply;
  assert.match(reply, /비트코인 \(BTC\)/);
});

test('사람이 적은 말은 걸러서 답장에 넣는다 (HTML로 나가므로)', () => {
  const reply = applyCommand({ name: 'add', arg: '<b>없는코인' }, named([])).reply;
  assert.ok(!reply.includes('<b>없는코인'), '태그가 그대로 나가면 텔레그램이 메시지를 거부한다');
  assert.match(reply, /&lt;b&gt;없는코인/);
});
