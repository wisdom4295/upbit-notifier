const BASE_URL = 'https://api.upbit.com/v1';
const MAX_COUNT_PER_REQUEST = 200; // 업비트 캔들 API 1회 최대 개수
const REQUEST_GAP_MS = 150; // 시세 API 초당 10회 제한 대비 여유

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path, { retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}${path}`, {
        headers: { Accept: 'application/json' },
      });
      // 429(호출 제한)와 5xx는 잠깐 쉬었다 재시도하면 대부분 풀린다.
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`업비트 API ${response.status}`);
      }
      if (!response.ok) {
        throw Object.assign(new Error(`업비트 API ${response.status}: ${await response.text()}`), {
          fatal: true,
        });
      }
      return await response.json();
    } catch (error) {
      if (error.fatal || attempt === retries) throw error;
      lastError = error;
      await sleep(2 ** attempt * 500);
    }
  }
  throw lastError;
}

/** 거래 가능한 마켓 코드 목록 (예: ["KRW-BTC", ...]) */
export async function fetchMarketCodes() {
  const markets = await request('/market/all?isDetails=false');
  return markets.map((m) => m.market);
}

/**
 * 분봉을 오래된 순서로 반환한다.
 * 업비트는 최신순 200개씩만 주므로 `to` 커서로 과거 방향으로 이어 받는다.
 */
export async function fetchCandles(market, unit, count) {
  const collected = [];
  let cursor = null;

  while (collected.length < count) {
    const remaining = Math.min(MAX_COUNT_PER_REQUEST, count - collected.length);
    const query = new URLSearchParams({ market, count: String(remaining) });
    if (cursor) query.set('to', cursor);

    const page = await request(`/candles/minutes/${unit}?${query}`);
    if (page.length === 0) break; // 상장 직후 등 과거 데이터가 더 없는 경우

    collected.push(...page);
    cursor = `${page.at(-1).candle_date_time_utc}Z`;

    if (page.length < remaining) break;
    if (collected.length < count) await sleep(REQUEST_GAP_MS);
  }

  return collected
    .map((candle) => ({
      market,
      timeUtc: candle.candle_date_time_utc,
      timeKst: candle.candle_date_time_kst,
      close: candle.trade_price,
      high: candle.high_price,
      low: candle.low_price,
      volume: candle.candle_acc_trade_volume,
    }))
    .reverse(); // 최신순 → 과거순
}
