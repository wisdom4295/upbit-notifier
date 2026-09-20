import test from 'node:test';
import assert from 'node:assert/strict';
import { sendMessage, formatSignal, formatStatus } from '../src/telegram.js';

const creds = { token: 'test-token', chatId: '1' };

/** fetch를 갈아 끼우고 호출 기록을 돌려준다. */
function stubFetch(responder) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return responder(calls.length);
  };
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const reply = (status, body = {}) =>
  new Response(JSON.stringify(body), { status });

test('429를 받으면 알려 준 시간만큼 기다렸다 다시 보낸다', async () => {
  const stub = stubFetch((n) =>
    n === 1 ? reply(429, { parameters: { retry_after: 0 } }) : reply(200, { ok: true }));
  try {
    await sendMessage('hi', creds);
    assert.equal(stub.calls.length, 2, '한 번 재시도해서 성공');
  } finally {
    stub.restore();
  }
});

test('400처럼 다시 보내도 소용없는 오류는 바로 실패시킨다', async () => {
  const stub = stubFetch(() => reply(400, { description: 'chat not found' }));
  try {
    await assert.rejects(() => sendMessage('hi', creds), /400/);
    assert.equal(stub.calls.length, 1, '재시도하지 않는다');
  } finally {
    stub.restore();
  }
});

test('서버 오류는 재시도하되 계속 실패하면 포기한다', async () => {
  const stub = stubFetch(() => reply(500));
  try {
    await assert.rejects(() => sendMessage('hi', creds), /500/);
    assert.ok(stub.calls.length > 1, '몇 번은 다시 시도한다');
  } finally {
    stub.restore();
  }
});

test('dry-run은 네트워크를 건드리지 않는다', async () => {
  const stub = stubFetch(() => reply(200, { ok: true }));
  try {
    await sendMessage('hi', { ...creds, dryRun: true });
    assert.equal(stub.calls.length, 0);
  } finally {
    stub.restore();
  }
});

test('토큰이 없으면 무엇이 빠졌는지 알려 준다', async () => {
  await assert.rejects(() => sendMessage('hi', {}), /TELEGRAM_BOT_TOKEN/);
});

const signal = (overrides = {}) => ({
  type: 'dead', gapPct: -0.115, short: 1891, long: 1893,
  candle: { close: 1757, timeKst: '2026-09-16T05:00:00' },
  ...overrides,
});
const context = { market: 'KRW-XRP', unit: 15, short: 50, long: 200 };

test('첫 줄에 코인과 무슨 일인지가 함께 있다', () => {
  // 폰 알림 배너에는 첫 줄만 보인다. 코인 이름만 있으면 열어 봐야 안다.
  const first = formatSignal(signal(), context).split('\n')[0];
  assert.match(first, /XRP/);
  assert.match(first, /50선이 200선 아래로/);
});

test('교차 방향이 첫 줄에서 갈린다', () => {
  const up = formatSignal(signal({ type: 'golden', gapPct: 0.042 }), context).split('\n')[0];
  assert.match(up, /50선이 200선 위로/);
  const near = formatSignal(signal({ type: 'proximity', gapPct: 0.31 }), context).split('\n')[0];
  assert.match(near, /근접/);
});

test('기간을 바꾸면 문구의 숫자도 따라간다', () => {
  const text = formatSignal(signal(), { ...context, short: 20, long: 60 });
  assert.match(text, /20선이 60선 아래로/);
  assert.match(text, /20선 {2}1,891원/);
});

test('두 선 차이는 부호 없이 크기만 보여 준다', () => {
  // 방향은 첫 줄이 이미 말해 주므로 음수 부호까지 읽을 필요가 없다.
  const text = formatSignal(signal(), context);
  assert.match(text, /두 선 차이 {2}<b>0\.115%<\/b>/);
  assert.ok(!text.includes('-0.115'), '음수 부호는 빼고 보여 준다');
});

test('시각은 연도와 초를 빼고 짧게 적는다', () => {
  assert.match(formatSignal(signal(), context), /09-16 05:00 기준 \(15분봉\)/);
});

test('메시지에 HTML 특수문자가 들어가도 태그로 새지 않는다', () => {
  const text = formatSignal(
    signal({ candle: { close: 1, timeKst: '2026-09-16T05:<b>0</b>' } }),
    { ...context, market: 'KRW-<script>' },
  );
  assert.ok(!text.includes('<script>'), '코인 코드가 이스케이프된다');
  assert.ok(!text.includes('CRIX.UPBIT.KRW-<'), '링크 주소도 안전하게 인코딩된다');

  // 굵게 표시(<b>)는 우리가 넣은 것이므로, 바깥에서 들어온 시각 줄만 따로 본다.
  const stampLine = text.split('\n').find((line) => line.includes('기준'));
  assert.ok(!stampLine.includes('<'), '시각 줄에 날것 꺾쇠가 남지 않는다');
  assert.match(stampLine, /&lt;/);
});

test('거래량선 돌파 알림은 가격과 선 하나만 견준다', () => {
  const signal = {
    type: 'breakUp',
    candle: { close: 103_800_000, timeKst: '2026-09-20T21:30:00' },
    line: 103_200_000,
    gapPct: 0.581,
  };
  const text = formatSignal(signal, { market: 'KRW-BTC', unit: 15, short: 50, long: 200, vwmaDays: 100 });

  assert.match(
    text,
    /^🟢 <b>BTC<\/b> · 15분봉 캔들이 100일 거래량가중 이동평균선 상향 돌파/,
    '첫 줄만 보고도 무엇이 무엇을 뚫었는지 안다',
  );
  assert.match(text, /100일 거래량가중선  103,200,000원/);
  assert.match(text, /선과의 차이  <b>0.581%<\/b>/);
  assert.ok(!text.includes('두 선 차이'), '50선·200선 이야기는 섞지 않는다');
  assert.ok(!text.includes('200선  '), '쓰지 않는 선은 적지 않는다');
  assert.ok(!text.includes('기준 (15분봉)'), '첫 줄이 이미 말했으므로 꼬리에서 되풀이하지 않는다');
  assert.match(text, /09-20 21:30 기준\n/);
});

test('아래로 뚫으면 빨강으로 온다', () => {
  const signal = {
    type: 'breakDown',
    candle: { close: 100, timeKst: '2026-09-20T21:30:00' },
    line: 110,
    gapPct: -9.09,
  };
  const text = formatSignal(signal, { market: 'KRW-XRP', unit: 15, short: 50, long: 200, vwmaDays: 100 });
  assert.match(text, /^🔴 <b>XRP<\/b> · 15분봉 캔들이 100일 거래량가중 이동평균선 하향 돌파/);
  assert.match(text, /선과의 차이  <b>9.090%<\/b>/, '방향은 첫 줄이 말하므로 크기만 적는다');
});

test('현재 상태에도 기준선 위치를 적는다', () => {
  const summaries = [{
    market: 'KRW-BTC',
    summary: { price: 103_800_000, short: 103_761_000, long: 103_718_000, gapPct: 0.042, line: 103_200_000, linePct: 0.581 },
  }];
  const text = formatStatus(summaries, { unit: 15, short: 50, long: 200, vwmaDays: 100 });
  assert.match(text, /100일 거래량가중선 103,200,000원/);
  assert.match(text, /가격이 0.58% 위/);
});

test('기준선을 끄면 현재 상태에도 나오지 않는다', () => {
  const summaries = [{ market: 'KRW-BTC', summary: { price: 100, short: 101, long: 100, gapPct: 1, line: null, linePct: null } }];
  const text = formatStatus(summaries, { unit: 15, short: 50, long: 200 });
  assert.ok(!text.includes('거래량'));
});
