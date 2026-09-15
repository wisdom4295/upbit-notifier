/**
 * 브라우저 저장소 래퍼.
 * 사파리 프라이빗 모드 등에서 localStorage 접근이 예외를 던지므로 전부 감싼다.
 */
const read = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const MARKETS_KEY = 'upbit-notifier:markets';
const TRADES_KEY = 'upbit-notifier:trades';

export const loadMarkets = () => {
  const stored = read(MARKETS_KEY, null);
  return Array.isArray(stored) && stored.length > 0 ? stored : null;
};
export const saveMarkets = (markets) => write(MARKETS_KEY, markets);

/** @returns {import('../src/portfolio.js').Trade[]} */
export const loadTrades = () => {
  const stored = read(TRADES_KEY, []);
  return Array.isArray(stored) ? stored : [];
};
export const saveTrades = (trades) => write(TRADES_KEY, trades);

export function addTrade(trade) {
  const trades = loadTrades();
  trades.push({ ...trade, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
  saveTrades(trades);
  return trades;
}

export function removeTrade(id) {
  const trades = loadTrades().filter((trade) => trade.id !== id);
  saveTrades(trades);
  return trades;
}
