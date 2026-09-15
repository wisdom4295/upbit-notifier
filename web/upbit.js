const BASE = 'https://api.upbit.com/v1';

/** 분봉을 과거순으로 반환. 업비트가 1회 200개만 주므로 to 커서로 이어 받는다. */
export async function fetchCandles(market, unit, count) {
  const collected = [];
  let cursor = null;

  while (collected.length < count) {
    const remaining = Math.min(200, count - collected.length);
    const query = new URLSearchParams({ market, count: String(remaining) });
    if (cursor) query.set('to', cursor);

    const response = await fetch(`${BASE}/candles/minutes/${unit}?${query}`);
    if (!response.ok) throw new Error(`업비트 응답 ${response.status}`);

    const page = await response.json();
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
  const response = await fetch(`${BASE}/market/all?isDetails=false`);
  if (!response.ok) throw new Error(`업비트 응답 ${response.status}`);
  const list = await response.json();
  return list.map((m) => m.market).filter((market) => market.startsWith('KRW-'));
}
