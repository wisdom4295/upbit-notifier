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

export const loadMarkets = () => {
  const stored = read(MARKETS_KEY, null);
  return Array.isArray(stored) && stored.length > 0 ? stored : null;
};
export const saveMarkets = (markets) => write(MARKETS_KEY, markets);
