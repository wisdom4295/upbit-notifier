import { readSignals } from './history.js';
import { fetchCandles } from './upbit.js';
import { todayRange, weekRange } from './period.js';
import { periodMove, gapTrend } from './report-stats.js';
import { signalLabel } from './labels.js';

const MAX_LISTED = 20; // 텔레그램 한 통은 4096자 제한이 있다
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

const won = (value) =>
  value >= 1000 ? Math.round(value).toLocaleString('ko-KR') : Number(value.toFixed(4)).toLocaleString('ko-KR');

/** 등락은 ▲▼로. 국내에서 가장 익숙한 표기다. */
const move = (pct) => {
  if (pct === null || pct === undefined) return '—';
  const rounded = Number(pct.toFixed(2));
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '▲' : '▼'}${Math.abs(rounded)}%`;
};

const coinOf = (market) => market.replace('KRW-', '');

/** '2026-09-16' → '9월 16일 (수)' */
function koreanDate(isoDate) {
  const [, month, day] = isoDate.split('-').map(Number);
  const weekday = WEEKDAY[new Date(`${isoDate}T00:00:00Z`).getUTCDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

/** 감시 중인 코인 전부의 시세를 받아 온다. 알림이 없던 코인도 움직임은 알아야 한다. */
async function loadSeries(markets, unit, fromMs) {
  const series = new Map();
  for (const market of markets) {
    const span = Date.now() - fromMs;
    // 200선을 계산하려면 기간 앞쪽으로 200봉이 더 필요하다.
    const needed = Math.ceil(span / (unit * 60_000)) + 220;
    try {
      series.set(market, await fetchCandles(market, unit, Math.min(needed, 1000)));
    } catch {
      series.set(market, []); // 한 종목을 못 받아도 나머지는 보낸다
    }
  }
  return series;
}

function movesSection(markets, series, periods, fromMs, label) {
  const lines = [];

  for (const market of markets) {
    const candles = series.get(market) ?? [];
    const moved = periodMove(candles, fromMs);
    if (!moved) {
      lines.push(`${coinOf(market)}  시세를 받지 못했습니다`);
      continue;
    }
    lines.push(`<b>${coinOf(market)}</b>  ${won(moved.last)}원  ${move(moved.changePct)}`);
    lines.push(`   ${label} ${won(moved.low)} ~ ${won(moved.high)}`);
  }

  return lines.join('\n');
}

function gapSection(markets, series, periods) {
  const { short, long } = periods;

  const rows = markets
    .map((market) => ({ market, trend: gapTrend(series.get(market) ?? [], periods, Date.now() - 24 * 60 * 60 * 1000) }))
    .filter((row) => row.trend)
    // 교차에 가까운 종목이 위로. 다음에 주목할 것이 먼저 보여야 한다.
    .sort((a, b) => Math.abs(a.trend.gapPct) - Math.abs(b.trend.gapPct));

  return rows
    .map(({ market, trend }) => {
      const side = trend.gapPct >= 0 ? '위' : '아래';
      const drift = trend.closing === null ? '' : trend.closing ? ' · 좁혀지는 중' : ' · 벌어지는 중';
      return `<b>${coinOf(market)}</b>  ${short}선이 ${long}선 ${side} ${Math.abs(trend.gapPct).toFixed(2)}%${drift}`;
    })
    .join('\n');
}

/**
 * 알림 한 건을 문장으로 풀어 적는다.
 *
 * 1시간·4시간·하루를 따로 적으면 아직 오지 않은 칸이 늘 섞여 "아직"만 가득하다.
 * 읽는 사람이 궁금한 것은 "그래서 지금 어떻게 됐나" 하나뿐이라 그것만 적는다.
 */
function signalBlock(signal, periods, daily, unit, nowPrice) {
  const { emoji, brief } = signalLabel(signal.type, { ...periods, unit });
  // 주간은 여러 날이 섞이므로 날짜까지 적어야 언제 일인지 안다.
  const when = daily ? `${signal.kst.slice(11, 16)}` : `${signal.kst.slice(5, 10)} ${signal.kst.slice(11, 16)}`;
  const head = `${when}  <b>${coinOf(signal.market)}</b>  ${emoji} ${brief}`;
  const then = `     알림 왔을 때 ${won(signal.price)}원`;

  if (nowPrice == null) return `${head}\n${then}`;

  const pct = ((nowPrice - signal.price) / signal.price) * 100;
  const verb = pct > 0 ? '올랐습니다' : pct < 0 ? '내렸습니다' : '그대로입니다';
  return `${head}\n${then}\n     지금은 ${won(nowPrice)}원 · ${move(pct)} ${verb}`;
}

function signalLines(signals, periods, daily, unit, priceNow) {
  return [...signals]
    .sort((a, b) => b.kst.localeCompare(a.kst))
    .slice(0, MAX_LISTED)
    .map((signal) => signalBlock(signal, periods, daily, unit, priceNow.get(signal.market) ?? null))
    .join('\n');
}

/**
 * 하루치 · 한 주치 정리를 만든다.
 * 알림 건수를 세는 대신, 투자하는 쪽에서 볼 것만 담는다.
 * 얼마나 움직였나 → 지금 두 선이 어디 있나 → 무슨 알림이 왔나.
 */
export function formatReport(period, range, { markets, series, signals, periods, unit }) {
  const daily = period === 'daily';
  const fromMs = Date.parse(`${range.from}+09:00`);
  const title = daily
    ? `📅 ${koreanDate(range.label)} 마감`
    : `🗓 주간 정리 · ${range.label}`;

  const sections = [
    `${title}\n${unit}분봉 · ${periods.short}선 / ${periods.long}선${periods.vwmaDays ? ` · ${periods.vwmaDays}일 거래량가중선` : ''}`,
    `<b>■ ${daily ? '오늘' : '이번 주'} 움직임</b>\n${movesSection(markets, series, periods, fromMs, daily ? '오늘' : '주간')}`,
  ];

  const gaps = gapSection(markets, series, periods);
  if (gaps) sections.push(`<b>■ 지금 두 선</b>\n${gaps}`);

  if (signals.length === 0) {
    sections.push(`<b>■ ${daily ? '오늘' : '이번 주'} 온 알림</b>\n없습니다.`);
    return sections.join('\n\n');
  }

  // 알림이 온 뒤 지금까지 어떻게 됐는지를 보려면 종목별 현재가가 필요하다.
  const priceNow = new Map(
    [...series].map(([market, candles]) => [market, candles.at(-1)?.close ?? null]),
  );

  const rest = signals.length > MAX_LISTED ? `\n…외 ${signals.length - MAX_LISTED}건` : '';
  sections.push(
    `<b>■ 받은 알림 ${signals.length}건</b> <i>(값은 리포트 보내는 지금 기준)</i>\n` +
    `${signalLines(signals, periods, daily, unit, priceNow)}${rest}`,
  );

  return sections.join('\n\n');
}

export async function buildReport(period, config, now = Date.now()) {
  const range = period === 'daily' ? todayRange(now) : weekRange(now);
  const fromMs = Date.parse(`${range.from}+09:00`);

  const series = await loadSeries(config.markets, config.candleUnit, fromMs);
  const signals = await readSignals(range);

  return {
    range,
    signals,
    text: formatReport(period, range, {
      markets: config.markets,
      series,
      signals,
      periods: config.periods,
      unit: config.candleUnit,
    }),
  };
}
