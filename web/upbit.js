const BASE = 'https://api.upbit.com/v1';
// 브라우저 요청은 출처(origin) 단위로 묶여 초당 1건 수준까지 떨어진다.
// (응답 헤더: Limit-By-Origin: Yes, Remaining-Req: sec=0)
const MIN_GAP_MS = 1200;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 호출을 한 줄로 세워 간격을 둔다. 동시에 쏘면 전부 429로 거부당한다.
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
          ? '업비트 호출 한도에 걸렸습니다. 잠시 뒤 다시 열어 주세요.'
          : `업비트 응답 ${response.status}`,
      );
    }
    await sleep(2 ** attempt * 1500);
  }
}

/** 여러 코인의 현재가를 한 번의 호출로 가져온다. */
export async function fetchPrices(markets) {
  if (markets.length === 0) return {};
  const list = await request(`/ticker?markets=${markets.join(',')}`);
  return Object.fromEntries(list.map((t) => [t.market, t.trade_price]));
}

/** 분봉을 과거순으로 반환. 업비트가 1회 200개만 주므로 to 커서로 이어 받는다. */
async function fetchCandles(market, unit, count) {
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

const cacheKey = (market, unit, count) => `upbit:candles:${market}:${unit}:${count}`;

function readCache(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null; // 저장소를 못 쓰는 브라우저에서도 화면은 떠야 한다
  }
}

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 용량이 찼거나 막혀 있어도 그냥 넘어간다 */
  }
}

/**
 * 캔들을 봉 하나가 끝날 때까지 다시 받지 않는다.
 * 15분봉이면 같은 15분 안에서는 몇 번을 새로 고쳐도 업비트를 부르지 않는다.
 */
export async function getCandles(market, unit, count) {
  const key = cacheKey(market, unit, count);
  const slot = Math.floor(Date.now() / (unit * 60_000));
  const cached = readCache(key);
  if (cached?.slot === slot && cached.candles?.length >= count) return cached.candles;

  const candles = await fetchCandles(market, unit, count);
  writeCache(key, { slot, candles });
  return candles;
}
