import { summarize } from '../src/indicators.js';
import { fetchCandles } from './upbit.js';
import { el, krw, coinOf } from './format.js';

/** 감시 종목의 현재 이평선 상태를 이평선에 가까운 순으로 보여 준다. */
export async function renderCurrent(root, { markets, settings }) {
  const { short, long } = settings.periods;
  if (markets.length === 0) {
    root.replaceChildren(el('p', { class: 'empty', text: '감시 중인 코인이 없습니다.' }));
    return;
  }

  const rows = await Promise.all(
    markets.map(async (market) => {
      try {
        const candles = await fetchCandles(market, settings.candleUnit, long + 2);
        return { market, summary: summarize(candles, settings.periods) };
      } catch (error) {
        return { market, summary: null, error: error.message };
      }
    }),
  );

  // 교차 임박 종목이 위로 오도록 이격 절댓값 순 정렬
  const sorted = [...rows].sort((a, b) => {
    if (!a.summary) return 1;
    if (!b.summary) return -1;
    return Math.abs(a.summary.gapPct) - Math.abs(b.summary.gapPct);
  });

  root.replaceChildren(
    ...sorted.map(({ market, summary, error }) => {
      const coin = coinOf(market);
      if (!summary) {
        return el('article', { class: 'card' }, [
          el('div', { class: 'row' }, [el('span', { class: 'coin', text: coin })]),
          el('div', { class: 'meta', text: error ?? `캔들 부족 (MA${long} 계산 불가)` }),
        ]);
      }

      const gap = summary.gapPct;
      const toneClass = Math.abs(gap) <= settings.proximityThresholdPct ? 'near' : gap >= 0 ? 'up' : 'down';
      const width = Math.min(100, (Math.abs(gap) / (settings.proximityThresholdPct * 10)) * 100);

      return el('article', { class: 'card' }, [
        el('div', { class: 'row' }, [
          el('span', { class: 'coin', text: coin }),
          el('span', { class: 'price', text: krw(summary.price) }),
        ]),
        el('div', { class: 'row', style: 'margin-top:6px' }, [
          el('span', {
            class: 'meta',
            style: 'margin:0',
            text: `MA${short} ${krw(summary.short)} · MA${long} ${krw(summary.long)}`,
          }),
          el('span', {
            class: `gap ${toneClass}`,
            text: `${gap >= 0 ? '+' : ''}${gap.toFixed(3)}%`,
          }),
        ]),
        el('div', { class: `bar gap ${toneClass}` }, [el('span', { style: `width:${width}%` })]),
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
    }),
  );
}
