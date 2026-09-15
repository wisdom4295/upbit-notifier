const BASE = 'https://api.upbit.com/v1';
const MIN_GAP_MS = 180;  // 업비트 시세 API는 초당 호출 수가 제한된다
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 화면은 여러 코인을 한꺼번에 그리지만, 업비트 호출은 한 줄로 세워 간격을 둔다.
// 동시에 쏘면 429(호출 과다)로 전부 거부당한다.
let queue = Promise.resolve();
let lastCallAt = 0;

function schedule(task) {
  const result = queue.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastCallAt);
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return task();
  });
  // 한 건이 실패해도 뒤에 선 요청은 계속 진행되어야 한다.
  queue = result.then(() => {}, () => {});
  return result;
}

async function request(path) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await schedule(() => fetch(`${BASE}${path}`));
    if (response.ok) return response.json();

    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt === MAX_RETRIES) {
      throw new Error(
        response.status === 429
          ? '업비트 호출이 너무 잦습니다. 잠시 뒤 다시 열어 주세요.'
          : `업비트 응답 ${response.status}`,
      );
    }
    await sleep(2 ** attempt * 600);
  }
}

/** 분봉을 과거순으로 반환. 업비트가 1회 200개만 주므로 to 커서로 이어 받는다. */
export async function fetchCandles(market, unit, count) {
  const collected = [];
  let cursor = null;

  while (collected.length < count) {
    const remaining = Math.min(200, count - collected.length);
    const query = new URLSearchParams({ market, count: String(remaining) });
    if (cursor) query.set('to', cursor);

    const page = await request(`/candles/minutes/${unit}?${query}`);
    if (page.length === 0) break;

    collected.push(...page);
    cursor = `${page.at(-1).candle_date_time_utc}Z`;
    if (page.length < remaining) break;
  }

  return collected
    .map((c) => ({
      timeKst: c.candle_date_time_kst,
      ms: Date.parse(`${c.candle_date_time_utc}Z`),
      close: c.trade_price,
    }))
    .reverse();
}

export async function fetchKrwMarkets() {
  const list = await request('/market/all?isDetails=false');
  return list.map((m) => m.market).filter((market) => market.startsWith('KRW-'));
}
