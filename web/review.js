import { summarizePortfolio, withinRange } from '../src/portfolio.js';
import { loadTrades, addTrade, removeTrade } from './store.js';
import { fetchTickers } from './upbit.js';
import { loadSignals, attachPerformance } from './history-client.js';
import { el, krw, signed, tone, coinOf, SIGNAL_LABEL, shortTime } from './format.js';

const HORIZONS = [1, 4, 24];

function tile(label, value, toneClass = '') {
  return el('div', { class: 'tile' }, [
    el('span', { class: 'tile-label', text: label }),
    el('strong', { class: `tile-value ${toneClass}`, text: value }),
  ]);
}

function signalTable(signals) {
  if (signals.length === 0) {
    return el('p', { class: 'empty', text: '이 기간에 발생한 신호가 없습니다.' });
  }

  const head = el('tr', {}, [
    el('th', { text: '시각' }),
    el('th', { text: '코인' }),
    el('th', { text: '신호' }),
    el('th', { class: 'num', text: '당시가' }),
    ...HORIZONS.map((h) => el('th', { class: 'num', text: `+${h}h` })),
  ]);

  const rows = signals.map((signal) =>
    el('tr', {}, [
      el('td', { text: shortTime(signal.kst) }),
      el('td', { class: 'strong', text: coinOf(signal.market) }),
      el('td', { text: SIGNAL_LABEL[signal.type] ?? signal.type }),
      el('td', { class: 'num', text: krw(signal.price) }),
      ...HORIZONS.map((h) =>
        el('td', { class: `num ${tone(signal.returns?.[h])}`, text: signed(signal.returns?.[h], 2, '%') }),
      ),
    ]),
  );

  return el('div', {}, [
    el('div', { class: 'scroll' }, [
      el('table', {}, [el('thead', {}, [head]), el('tbody', {}, rows)]),
    ]),
    el('p', { class: 'scroll-hint', text: '← 표를 옆으로 밀면 +4h, +24h 성과가 보입니다' }),
  ]);
}

function tradeForm(markets, onAdded) {
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16); // KST 기본값
  const market = el('input', { list: 'market-list', placeholder: '코인 (BTC)', required: 'required' });
  const side = el('select', {}, [
    el('option', { value: 'buy', text: '매수' }),
    el('option', { value: 'sell', text: '매도' }),
  ]);
  const price = el('input', { type: 'number', step: 'any', min: '0', placeholder: '가격', required: 'required' });
  const quantity = el('input', { type: 'number', step: 'any', min: '0', placeholder: '수량', required: 'required' });
  const at = el('input', { type: 'datetime-local', value: now, required: 'required' });
  const memo = el('input', { placeholder: '메모 (선택)' });

  const form = el('form', {
    class: 'trade-form',
    onsubmit: (event) => {
      event.preventDefault();
      const code = market.value.trim().toUpperCase();
      if (!code) return;
      addTrade({
        // datetime-local 값은 초가 없어 이력(kst)과 같은 형식으로 맞춘다.
        ts: at.value.length === 16 ? `${at.value}:00` : at.value,
        market: code.includes('-') ? code : `KRW-${code}`,
        side: side.value,
        price: Number(price.value),
        quantity: Number(quantity.value),
        memo: memo.value.trim(),
      });
      form.reset();
      at.value = now;
      onAdded();
    },
  }, [
    market, side, price, quantity, at, memo,
    el('button', { type: 'submit', text: '기록 추가' }),
  ]);

  return form;
}

function tradeTable(trades, onChanged) {
  if (trades.length === 0) {
    return el('p', { class: 'empty', text: '이 기간의 매매 기록이 없습니다.' });
  }

  const rows = [...trades]
    .sort((a, b) => b.ts.localeCompare(a.ts))
    .map((trade) =>
      el('tr', {}, [
        el('td', { text: shortTime(trade.ts) }),
        el('td', { class: 'strong', text: coinOf(trade.market) }),
        el('td', { class: trade.side === 'buy' ? 'up' : 'down', text: trade.side === 'buy' ? '매수' : '매도' }),
        el('td', { class: 'num', text: krw(trade.price) }),
        el('td', { class: 'num', text: krw(trade.quantity) }),
        el('td', { class: 'memo', text: trade.memo || '' }),
        el('td', {}, [
          el('button', {
            class: 'link',
            type: 'button',
            'aria-label': '삭제',
            text: '✕',
            onclick: () => {
              removeTrade(trade.id);
              onChanged();
            },
          }),
        ]),
      ]),
    );

  return el('div', { class: 'scroll' }, [
    el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: '시각' }), el('th', { text: '코인' }), el('th', { text: '구분' }),
          el('th', { class: 'num', text: '가격' }), el('th', { class: 'num', text: '수량' }),
          el('th', { text: '메모' }), el('th', {}),
        ]),
      ]),
      el('tbody', {}, rows),
    ]),
  ]);
}

function holdingsTable(rows) {
  const held = rows.filter((row) => row.quantity > 0);
  if (held.length === 0) return el('p', { class: 'empty', text: '보유 중인 코인이 없습니다.' });

  return el('div', { class: 'scroll' }, [
    el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: '코인' }), el('th', { class: 'num', text: '수량' }),
          el('th', { class: 'num', text: '평단' }), el('th', { class: 'num', text: '현재가' }),
          el('th', { class: 'num', text: '평가손익' }), el('th', { class: 'num', text: '수익률' }),
        ]),
      ]),
      el('tbody', {}, held.map((row) =>
        el('tr', {}, [
          el('td', { class: 'strong', text: coinOf(row.market) }),
          el('td', { class: 'num', text: krw(row.quantity) }),
          el('td', { class: 'num', text: krw(row.avgPrice) }),
          el('td', { class: 'num', text: krw(row.price) }),
          el('td', { class: `num ${tone(row.unrealizedPnl)}`, text: signed(row.unrealizedPnl, 0) }),
          el('td', { class: `num ${tone(row.returnPct)}`, text: signed(row.returnPct, 2, '%') }),
        ]),
      )),
    ]),
  ]);
}

/**
 * 회고 탭 한 화면을 그린다. 신호 이력(자동 기록)과 매매 기록(직접 입력)을
 * 같은 기간 기준으로 나란히 보여 준다.
 */
export async function renderReview(root, { range, settings, markets, rerender }) {
  root.replaceChildren(el('p', { class: 'empty', text: '불러오는 중…' }));

  const trades = loadTrades();
  const rangeTrades = withinRange(trades, range.from, range.to);

  let signals = [];
  let failed = false;
  try {
    signals = await attachPerformance(await loadSignals(range), settings.candleUnit);
  } catch {
    failed = true;
  }

  // 평가손익은 보유 전체 기준이라 기간과 무관하게 현재가가 필요하다.
  const heldMarkets = [...new Set(trades.map((trade) => trade.market))];
  let prices = {};
  try {
    prices = await fetchTickers(heldMarkets);
  } catch {
    prices = {};
  }

  const portfolio = summarizePortfolio(trades, prices);
  const rangeRealized = withinRange(portfolio.realizedEvents, range.from, range.to)
    .reduce((sum, event) => sum + event.profit, 0);

  const counts = signals.reduce((acc, signal) => {
    acc[signal.type] = (acc[signal.type] ?? 0) + 1;
    return acc;
  }, {});

  const scored = signals.map((s) => s.returns?.[24]).filter((v) => v !== null && v !== undefined);
  const avg24 = scored.length > 0 ? scored.reduce((a, b) => a + b, 0) / scored.length : null;

  root.replaceChildren(
    el('p', { class: 'range', text: range.label }),

    el('div', { class: 'tiles' }, [
      tile('신호', `${signals.length}건`),
      tile('골든 / 데드 / 근접', `${counts.golden ?? 0} / ${counts.dead ?? 0} / ${counts.proximity ?? 0}`),
      tile('신호 후 24h 평균', signed(avg24, 2, '%'), tone(avg24)),
      tile('기간 실현손익', signed(rangeRealized, 0), tone(rangeRealized)),
      tile('보유 평가손익', signed(portfolio.unrealizedPnl, 0), tone(portfolio.unrealizedPnl)),
      tile('매매', `${rangeTrades.length}건`),
    ]),

    el('h2', { text: '신호 이력' }),
    failed
      ? el('p', { class: 'error', text: '이력을 불러오지 못했습니다.' })
      : signalTable(signals),

    el('h2', { text: '보유 현황' }),
    holdingsTable(portfolio.rows),

    ...portfolio.warnings.map((warning) => el('p', { class: 'error', text: warning })),

    el('h2', { text: '매매 기록' }),
    tradeForm(markets, rerender),
    tradeTable(rangeTrades, rerender),
    el('p', {
      class: 'note',
      text: '매매 기록은 이 브라우저에만 저장됩니다. 기기를 바꾸면 따라가지 않습니다.',
    }),
  );
}
