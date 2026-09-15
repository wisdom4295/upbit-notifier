import { readSignals } from './history.js';
import { fetchCandles } from './upbit.js';
import { returnAfter, todayRange, weekRange } from './period.js';
import { byType, overview, HORIZONS } from './review-stats.js';
import { signalName } from './labels.js';

// 텔레그램 한 통은 4096자 제한이 있다. 건수가 많은 날은 목록을 줄인다.
const MAX_LISTED = 25;
const HORIZON_LABEL = { 1: '1시간', 4: '4시간', 24: '하루' };

const krw = (value) =>
  value >= 1000 ? Math.round(value).toLocaleString('ko-KR') : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

const pct = (value) => {
  if (value === null || value === undefined) return '—';
  const rounded = Number(value.toFixed(2));
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
};

/** 신호마다 그 뒤 가격이 어떻게 움직였는지 붙인다. */
export async function attachReturns(signals, defaultUnit) {
  if (signals.length === 0) return [];

  const oldest = new Map();
  for (const signal of signals) {
    const ms = Date.parse(`${signal.ts}Z`);
    const unit = signal.unit ?? defaultUnit;
    const current = oldest.get(signal.market);
    if (!current || ms < current.ms) oldest.set(signal.market, { ms, unit });
  }

  const series = new Map();
  for (const [market, { ms, unit }] of oldest) {
    // 하루 뒤 성과까지 보려면 신호 시점부터 지금까지가 다 필요하다.
    const needed = Math.ceil((Date.now() - ms) / (unit * 60_000)) + 5;
    try {
      series.set(market, await fetchCandles(market, unit, Math.min(Math.max(needed, 10), 1000)));
    } catch {
      series.set(market, []); // 시세를 못 받아도 목록은 보내야 한다
    }
  }

  return signals.map((signal) => {
    const candles = series.get(signal.market) ?? [];
    const ms = Date.parse(`${signal.ts}Z`);
    return {
      ...signal,
      returns: Object.fromEntries(HORIZONS.map((h) => [h, returnAfter(candles, ms, h, signal.price)])),
    };
  });
}

function line(signal, periods) {
  const time = signal.kst.slice(5, 16).replace('T', ' ');
  const after = HORIZONS.map((h) => `${HORIZON_LABEL[h]} ${pct(signal.returns?.[h])}`).join(' · ');
  return `${time} <b>${signal.market.replace('KRW-', '')}</b> ${signalName(signal.type, periods)}\n   ${krw(signal.price)} → ${after}`;
}

/**
 * 하루치 · 한 주치 정리를 텔레그램 메시지로 만든다.
 * @param {'daily'|'weekly'} period
 */
export function formatReport(period, range, signals, { short, long, unit }) {
  const title = period === 'daily' ? '📅 오늘 알림 정리' : '🗓 이번 주 알림 정리';
  const head = `${title}\n${range.label}\n${unit}분봉 · ${short}선 / ${long}선`;

  if (signals.length === 0) {
    return `${head}\n\n이 기간에 온 알림이 없습니다.`;
  }

  const summary = overview(signals);
  const counts = `알림 <b>${summary.total}건</b> · 위로 ${summary.counts.golden} · 아래로 ${summary.counts.dead} · 근접 ${summary.counts.proximity}`;
  const average = HORIZONS.map((h) => `${HORIZON_LABEL[h]} ${pct(summary.returns[h])}`).join(' · ');

  const perType = byType(signals)
    .map((row) => `${signalName(row.type, { short, long })} ${row.count}건 — 하루 뒤 평균 ${pct(row.returns[24])}`)
    .join('\n');

  const newest = [...signals].sort((a, b) => b.kst.localeCompare(a.kst));
  const listed = newest.slice(0, MAX_LISTED).map((s) => line(s, { short, long })).join('\n');
  const rest = newest.length > MAX_LISTED ? `\n\n…외 ${newest.length - MAX_LISTED}건` : '';

  return [
    head,
    '',
    counts,
    `신호 후 평균: ${average}`,
    '',
    '<b>종류별</b>',
    perType,
    '',
    '<b>받은 알림</b>',
    listed + rest,
  ].join('\n');
}

/** 리포트에 쓸 신호를 모아 성과까지 붙여 돌려준다. */
export async function buildReport(period, config, now = Date.now()) {
  const range = period === 'daily' ? todayRange(now) : weekRange(now);
  const signals = await attachReturns(await readSignals(range), config.candleUnit);
  return {
    range,
    signals,
    text: formatReport(period, range, signals, { ...config.periods, unit: config.candleUnit }),
  };
}
