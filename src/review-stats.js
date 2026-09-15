/**
 * 신호 이력 집계. 순수 함수만 두어 브라우저와 Node 양쪽에서 쓴다.
 * 입력은 워크플로가 쌓은 이력이므로 사용자가 따로 적을 것이 없다.
 */

export const HORIZONS = [1, 4, 24];

const mean = (values) => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length);

/** 값이 있는 성과만 모아 평균을 낸다. (아직 시간이 안 지난 신호는 제외) */
function averageReturns(signals) {
  return Object.fromEntries(
    HORIZONS.map((hours) => [
      hours,
      mean(signals.map((s) => s.returns?.[hours]).filter((v) => typeof v === 'number')),
    ]),
  );
}

/**
 * 신호 종류별 건수와 평균 성과.
 * "어떤 신호가 실제로 맞았나"를 보는 것이 회고의 핵심이라 종류별로 나눈다.
 */
export function byType(signals) {
  const types = ['golden', 'dead', 'proximity'];
  return types
    .map((type) => {
      const matching = signals.filter((signal) => signal.type === type);
      return { type, count: matching.length, returns: averageReturns(matching) };
    })
    .filter((row) => row.count > 0);
}

/** 코인별 건수와 평균 성과. 신호가 잦은 종목을 알아보는 용도. */
export function byMarket(signals) {
  const markets = [...new Set(signals.map((signal) => signal.market))];
  return markets
    .map((market) => {
      const matching = signals.filter((signal) => signal.market === market);
      return { market, count: matching.length, returns: averageReturns(matching) };
    })
    .sort((a, b) => b.count - a.count);
}

/** 화면 상단 요약 */
export function overview(signals) {
  const counts = { golden: 0, dead: 0, proximity: 0 };
  for (const signal of signals) {
    if (signal.type in counts) counts[signal.type] += 1;
  }
  return { total: signals.length, counts, returns: averageReturns(signals) };
}
