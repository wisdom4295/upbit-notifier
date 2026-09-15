import { readFile } from 'node:fs/promises';

const VALID_UNITS = [1, 3, 5, 10, 15, 30, 60, 240];

const DEFAULTS = {
  markets: ['KRW-BTC'],
  candleUnit: 15,
  periods: { short: 50, long: 200 },
  alerts: {
    goldenCross: true,
    deadCross: true,
    proximity: true,
    proximityThresholdPct: 0.3,
  },
  lookbackCandles: 8,
  confirmOnClosedCandle: true,
};

/**
 * config.json을 읽고 검증한다. 잘못된 값은 cron이 조용히 실패하는 대신
 * 바로 에러를 던져서 Actions 로그에 드러나게 한다.
 */
export async function loadConfig(path = 'config.json') {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const config = {
    ...DEFAULTS,
    ...raw,
    periods: { ...DEFAULTS.periods, ...raw.periods },
    alerts: { ...DEFAULTS.alerts, ...raw.alerts },
  };

  if (!Array.isArray(config.markets) || config.markets.length === 0) {
    throw new Error('config.markets는 비어 있을 수 없습니다. 예: ["KRW-BTC"]');
  }
  for (const market of config.markets) {
    if (!/^(KRW|BTC|USDT)-[A-Z0-9]+$/.test(market)) {
      throw new Error(`잘못된 마켓 코드: ${market} (예: KRW-BTC)`);
    }
  }
  if (!VALID_UNITS.includes(config.candleUnit)) {
    throw new Error(`candleUnit은 ${VALID_UNITS.join(', ')} 중 하나여야 합니다.`);
  }
  const { short, long } = config.periods;
  if (!Number.isInteger(short) || !Number.isInteger(long) || short < 2 || long <= short) {
    throw new Error('periods는 정수여야 하며 long > short > 1 이어야 합니다.');
  }
  if (config.alerts.proximityThresholdPct <= 0) {
    throw new Error('proximityThresholdPct는 0보다 커야 합니다.');
  }

  return config;
}
