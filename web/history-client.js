import { returnAfter } from '../src/period.js';
import { getCandles } from './upbit.js';

const MAX_CANDLES = 1000; // 성과 계산용 시세는 넉넉하되 호출이 과하지 않게 제한

/** 기간이 걸쳐 있는 달 목록 ('2026-08', '2026-09' …) */
function monthsInRange(from, to) {
  const months = new Set([from.slice(0, 7)]);
  const end = to.slice(0, 7);
  let cursor = from.slice(0, 7);
  while (cursor < end) {
    const [year, month] = cursor.split('-').map(Number);
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    months.add(cursor);
  }
  return [...months];
}

/**
 * 워크플로가 레포에 커밋해 둔 신호 이력을 읽는다. 서버 없이 정적 파일만 읽으므로
 * 아직 알림이 없었다면 파일이 없는 게 정상 — 빈 배열로 취급한다.
 */
export async function loadSignals({ from, to }) {
  const wanted = monthsInRange(from, to);
  const index = await fetch('./history/index.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);

  const months = index?.months ? index.months.filter((m) => wanted.includes(m)) : wanted;

  const pages = await Promise.all(
    months.map((month) =>
      fetch(`./history/${month}.json`)
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ),
  );

  return pages
    .flat()
    .filter((record) => record.kst >= from && record.kst < to)
    .sort((a, b) => b.kst.localeCompare(a.kst)); // 최신순
}

/**
 * 신호 이후 1/4/24시간 가격 변화를 붙인다.
 * 마켓별로 시세를 한 번만 받아 모든 신호가 나눠 쓴다.
 */
export async function attachPerformance(signals, defaultUnit) {
  if (signals.length === 0) return [];

  const byMarket = new Map();
  for (const signal of signals) {
    const ms = Date.parse(`${signal.ts}Z`);
    if (!byMarket.has(signal.market)) byMarket.set(signal.market, { oldest: ms, unit: signal.unit ?? defaultUnit });
    const entry = byMarket.get(signal.market);
    entry.oldest = Math.min(entry.oldest, ms);
  }

  // 한 줄로 세워 받는다. 동시에 부르면 업비트가 호출 한도로 거부한다.
  const series = new Map();
  for (const [market, { oldest, unit }] of byMarket) {
    await (async () => {
      const spanMs = Date.now() - oldest;
      const count = Math.min(MAX_CANDLES, Math.ceil(spanMs / (unit * 60_000)) + 5);
      try {
        series.set(market, await getCandles(market, unit, Math.max(count, 10)));
      } catch {
        series.set(market, []); // 조회 실패해도 이력 자체는 보여 준다
      }
    })();
  }

  return signals.map((signal) => {
    const candles = series.get(signal.market) ?? [];
    const ms = Date.parse(`${signal.ts}Z`);
    return {
      ...signal,
      returns: {
        1: returnAfter(candles, ms, 1, signal.price),
        4: returnAfter(candles, ms, 4, signal.price),
        24: returnAfter(candles, ms, 24, signal.price),
      },
    };
  });
}
