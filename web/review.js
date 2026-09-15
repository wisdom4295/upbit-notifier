import { byType, byMarket, overview, HORIZONS } from '../src/review-stats.js';
import { loadSignals, attachPerformance } from './history-client.js';
import { el, krw, signed, tone, coinOf, SIGNAL_LABEL, shortTime } from './format.js';

function tile(label, value, toneClass = '') {
  return el('div', { class: 'tile' }, [
    el('span', { class: 'tile-label', text: label }),
    el('strong', { class: `tile-value ${toneClass}`, text: value }),
  ]);
}

function table(headers, rows, { hint = false } = {}) {
  return el('div', {}, [
    el('div', { class: 'scroll' }, [
      el('table', {}, [
        el('thead', {}, [el('tr', {}, headers)]),
        el('tbody', {}, rows),
      ]),
    ]),
    // 열이 많은 표만 좁은 화면에서 잘리므로 그때만 안내한다.
    hint ? el('p', { class: 'scroll-hint', text: '← 표를 옆으로 밀면 +4h, +24h 성과가 보입니다' }) : null,
  ]);
}

const returnCells = (returns) =>
  HORIZONS.map((hours) =>
    el('td', { class: `num ${tone(returns?.[hours])}`, text: signed(returns?.[hours], 2, '%') }),
  );

// DOM 노드는 다른 부모에 넣으면 이동해 버리므로, 표마다 새로 만들어야 한다.
const returnHeaders = () => HORIZONS.map((hours) => el('th', { class: 'num', text: `+${hours}h` }));

function signalTable(signals) {
  return table(
    [
      el('th', { text: '시각' }),
      el('th', { text: '코인' }),
      el('th', { text: '신호' }),
      el('th', { class: 'num', text: '당시가' }),
      ...returnHeaders(),
    ],
    signals.map((signal) =>
      el('tr', {}, [
        el('td', { text: shortTime(signal.kst) }),
        el('td', { class: 'strong', text: coinOf(signal.market) }),
        el('td', { text: SIGNAL_LABEL[signal.type] ?? signal.type }),
        el('td', { class: 'num', text: krw(signal.price) }),
        ...returnCells(signal.returns),
      ]),
    ),
    { hint: true },
  );
}

function statsTable(label, rows, nameOf) {
  return table(
    [
      el('th', { text: label }),
      el('th', { class: 'num', text: '건수' }),
      ...returnHeaders(),
    ],
    rows.map((row) =>
      el('tr', {}, [
        el('td', { class: 'strong', text: nameOf(row) }),
        el('td', { class: 'num', text: String(row.count) }),
        ...returnCells(row.returns),
      ]),
    ),
  );
}

/**
 * 회고 한 화면. 워크플로가 쌓아 둔 신호 이력만 읽으므로 입력할 것이 없고,
 * 어느 기기에서 열어도 같은 내용이 보인다.
 */
export async function renderReview(root, { range, settings }) {
  root.replaceChildren(el('p', { class: 'empty', text: '불러오는 중…' }));

  let signals;
  try {
    signals = await attachPerformance(await loadSignals(range), settings.candleUnit);
  } catch {
    root.replaceChildren(
      el('p', { class: 'range', text: range.label }),
      el('p', { class: 'error', text: '신호 이력을 불러오지 못했습니다.' }),
    );
    return;
  }

  if (signals.length === 0) {
    root.replaceChildren(
      el('p', { class: 'range', text: range.label }),
      el('p', { class: 'empty', text: '이 기간에 발생한 신호가 없습니다.' }),
      el('p', {
        class: 'note',
        text: '신호 이력은 알림이 나갈 때 쌓입니다. 워크플로를 켠 뒤부터 기록됩니다.',
      }),
    );
    return;
  }

  const summary = overview(signals);

  root.replaceChildren(
    el('p', { class: 'range', text: range.label }),

    el('div', { class: 'tiles' }, [
      tile('신호', `${summary.total}건`),
      tile('골든 / 데드 / 근접',
        `${summary.counts.golden} / ${summary.counts.dead} / ${summary.counts.proximity}`),
      tile('신호 후 1h 평균', signed(summary.returns[1], 2, '%'), tone(summary.returns[1])),
      tile('신호 후 24h 평균', signed(summary.returns[24], 2, '%'), tone(summary.returns[24])),
    ]),

    el('h2', { text: '신호 이력' }),
    signalTable(signals),

    el('h2', { text: '신호별 성과' }),
    statsTable('신호', byType(signals), (row) => SIGNAL_LABEL[row.type] ?? row.type),

    el('h2', { text: '코인별 성과' }),
    statsTable('코인', byMarket(signals), (row) => coinOf(row.market)),

    el('p', {
      class: 'note',
      text: '성과는 신호 발생 당시 종가 대비 가격 변화입니다. 아직 그 시점이 지나지 않았으면 —로 표시됩니다.',
    }),
  );
}
