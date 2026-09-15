import { summarize } from '../src/indicators.js';
import { getCandles, fetchPrices } from './upbit.js';
import { el, krw, coinOf } from './format.js';

/** 카드 한 장. 아직 값이 없으면 자리만 잡아 둔다. */
function card(market, { summary, price, error, loading, settings }) {
  const { short, long, proximityThresholdPct } = settings;
  const coin = coinOf(market);

  if (loading) {
    return el('article', { class: 'card', 'data-market': market }, [
      el('div', { class: 'row' }, [el('span', { class: 'coin', text: coin })]),
      el('div', { class: 'meta', text: '불러오는 중…' }),
    ]);
  }

  if (!summary) {
    return el('article', { class: 'card', 'data-market': market }, [
      el('div', { class: 'row' }, [el('span', { class: 'coin', text: coin })]),
      el('div', { class: 'meta', text: error ?? `캔들이 부족해 ${long}선을 계산할 수 없습니다` }),
    ]);
  }

  const gap = summary.gapPct;
  const tone = Math.abs(gap) <= proximityThresholdPct ? 'near' : gap >= 0 ? 'up' : 'down';
  const width = Math.min(100, (Math.abs(gap) / (proximityThresholdPct * 10)) * 100);

  return el('article', { class: 'card', 'data-market': market }, [
    el('div', { class: 'row' }, [
      el('span', { class: 'coin', text: coin }),
      el('span', { class: 'price', text: krw(price ?? summary.price) }),
    ]),
    el('div', { class: 'row', style: 'margin-top:6px' }, [
      el('span', {
        class: 'meta',
        style: 'margin:0',
        text: `${short}선 ${krw(summary.short)} · ${long}선 ${krw(summary.long)}`,
      }),
      el('span', { class: `gap ${tone}`, text: `${gap >= 0 ? '+' : ''}${gap.toFixed(3)}%` }),
    ]),
    el('div', { class: `bar gap ${tone}` }, [el('span', { style: `width:${width}%` })]),
    el('div', { class: 'meta' }, [
      el('span', { text: `${summary.time.replace('T', ' ')} KST` }),
      el('a', {
        href: `https://upbit.com/exchange?code=CRIX.UPBIT.${market}`,
        target: '_blank',
        rel: 'noopener',
        text: '차트',
      }),
    ]),
  ]);
}

/**
 * 감시 종목의 지금 두 선 위치를 보여 준다.
 *
 * 업비트는 브라우저 호출을 출처 단위로 강하게 제한하므로 호출을 아낀다.
 * 현재가는 한 번의 호출로 전부 받고, 캔들은 봉이 바뀔 때까지 다시 받지 않는다.
 * 그래도 첫 방문에는 코인 수만큼 기다려야 하니, 받는 대로 한 장씩 그려 준다.
 */
export async function renderCurrent(root, { markets, settings }) {
  const { long } = settings.periods;
  if (markets.length === 0) {
    root.replaceChildren(el('p', { class: 'empty', text: '알림 받는 코인이 없습니다.' }));
    return;
  }

  const view = { ...settings.periods, proximityThresholdPct: settings.proximityThresholdPct };
  const cards = new Map(markets.map((market) => [market, card(market, { loading: true, settings: view })]));
  root.replaceChildren(...cards.values());

  // 현재가는 한 번에 받는다. 실패해도 캔들 종가로 대신할 수 있다.
  const prices = await fetchPrices(markets).catch(() => ({}));

  const results = [];
  for (const market of markets) {
    let entry;
    try {
      const candles = await getCandles(market, settings.candleUnit, long);
      entry = { market, summary: summarize(candles, settings.periods), price: prices[market] };
    } catch (error) {
      entry = { market, summary: null, error: error.message };
    }

    results.push(entry);
    cards.get(market).replaceWith((cards.set(market, card(market, { ...entry, settings: view })), cards.get(market)));
  }

  // 다 모이면 교차에 가까운 순서로 다시 세운다.
  const sorted = [...results].sort((a, b) => {
    if (!a.summary) return 1;
    if (!b.summary) return -1;
    return Math.abs(a.summary.gapPct) - Math.abs(b.summary.gapPct);
  });
  root.replaceChildren(...sorted.map((entry) => cards.get(entry.market)));
}
