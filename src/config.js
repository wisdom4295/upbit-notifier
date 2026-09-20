import { readFile, writeFile } from 'node:fs/promises';

const VALID_UNITS = [1, 3, 5, 10, 15, 30, 60, 240];

const DEFAULTS = {
  markets: ['KRW-BTC'],
  candleUnit: 15,
  periods: { short: 50, long: 200, vwmaDays: 100 },
  alerts: {
    goldenCross: true,
    deadCross: true,
    proximity: true,
    proximityThresholdPct: 0.3,
    vwmaBreakUp: true,
    vwmaBreakDown: true,
    // 선을 스치기만 해도 알리면 잔파동에 하루 대여섯 번 울린다.
    // 이만큼 확실히 벗어나야 넘어간 것으로 친다.
    vwmaMarginPct: 0.3,
  },
  lookbackCandles: 8,
  confirmOnClosedCandle: true,
};

/** 감시 목록만 바꿔 다시 저장한다. 나머지 설정은 건드리지 않는다. */
export async function saveMarkets(markets, path = 'config.json') {
  const raw = JSON.parse(await readFile(path, 'utf8'));
  raw.markets = markets;
  await writeFile(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
}

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
  const { short, long, vwmaDays } = config.periods;
  if (!Number.isInteger(short) || !Number.isInteger(long) || short < 2 || long <= short) {
    throw new Error('periods는 정수여야 하며 long > short > 1 이어야 합니다.');
  }
  // 거래량가중선은 끌 수 있어야 하므로 없거나 0이면 계산 자체를 건너뛴다.
  // 일봉은 업비트가 한 번에 200개까지 준다.
  if (vwmaDays !== undefined && vwmaDays !== null && (!Number.isInteger(vwmaDays) || vwmaDays < 2 || vwmaDays > 198)) {
    throw new Error('periods.vwmaDays는 2~198 사이 정수여야 합니다. 끄려면 항목을 지우세요.');
  }
  if (config.alerts.proximityThresholdPct <= 0) {
    throw new Error('proximityThresholdPct는 0보다 커야 합니다.');
  }
  if (config.alerts.vwmaMarginPct < 0) {
    throw new Error('vwmaMarginPct는 0 이상이어야 합니다. (0이면 스치기만 해도 알립니다)');
  }

  return config;
}
