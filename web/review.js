import { byType, overview, HORIZONS } from '../src/review-stats.js';
import { signalName, duration } from '../src/labels.js';
import { loadSignals, attachPerformance } from './history-client.js';
import { el, krw, signed, tone, coinOf, shortTime } from './format.js';

// 처음부터 다 펼치면 신호가 많은 주에는 화면이 끝없이 길어진다.
const FIRST_PAGE = 20;

const HORIZON_LABEL = { 1: '1시간 뒤', 4: '4시간 뒤', 24: '하루 뒤' };

/** 성과 3개를 한 줄에 나란히. 표가 아니라 격자라서 가로로 밀 일이 없다. */
function returnsRow(returns) {
  return el(
    'div',
    { class: 'after' },
    HORIZONS.map((hours) =>
      el('div', { class: 'after-cell' }, [
        el('span', { class: 'after-label', text: HORIZON_LABEL[hours] ?? `${hours}시간 뒤` }),
        el('strong', { class: `after-value ${tone(returns?.[hours])}`, text: signed(returns?.[hours], 2, '%') }),
      ]),
    ),
  );
}

function signalCard(signal, periods) {
  return el('article', { class: 'signal' }, [
    el('div', { class: 'signal-head' }, [
      el('span', { class: 'signal-name', text: signalName(signal.type, periods) }),
      el('span', { class: 'signal-coin', text: coinOf(signal.market) }),
    ]),
    el('p', { class: 'signal-meta', text: `${shortTime(signal.kst)} · 당시 ${krw(signal.price)}` }),
    returnsRow(signal.returns),
  ]);
}

function statsCard(row, periods) {
  return el('article', { class: 'signal' }, [
    el('div', { class: 'signal-head' }, [
      el('span', { class: 'signal-name', text: signalName(row.type, periods) }),
      el('span', { class: 'signal-coin', text: `${row.count}건` }),
    ]),
    returnsRow(row.returns),
  ]);
}

function tile(label, value, toneClass = '') {
  return el('div', { class: 'tile' }, [
    el('span', { class: 'tile-label', text: label }),
    el('strong', { class: `tile-value ${toneClass}`, text: value }),
  ]);
}

/**
 * 세 신호가 각각 무슨 뜻인지 화면에서 바로 알 수 있게 한다.
 * 이름만 보면 "무엇이" 오르내리는 것인지 드러나지 않기 때문이다.
 */
function legend({ short, long, candleUnit, proximityThresholdPct }) {
  const explain = (type, when) =>
    el('li', {}, [el('strong', { text: signalName(type, { short, long }) }), ` — ${when}`]);

  return el('details', { class: 'legend' }, [
    el('summary', { text: '신호가 무슨 뜻인가요?' }),
    el('ul', {}, [
      explain('golden', `${short}선이 ${long}선을 아래에서 위로 뚫었을 때`),
      explain('dead', `${short}선이 ${long}선을 위에서 아래로 뚫었을 때`),
      explain('proximity', `두 선 차이가 ${proximityThresholdPct}% 이내로 좁혀졌을 때 (아직 안 뚫음)`),
    ]),
    el('p', {}, [
      `${short}선 = 최근 ${short}개 봉(약 ${duration(short, candleUnit)})의 평균 가격, `,
      `${long}선 = 최근 ${long}개 봉(약 ${duration(long, candleUnit)})의 평균 가격입니다. `,
      `움직이는 쪽은 ${short}선입니다 — 적은 봉을 평균내서 최근 가격에 먼저 반응합니다.`,
    ]),
    el('p', {
      text: '평균은 지나간 가격으로 내는 값이라 신호는 항상 한 박자 늦습니다. '
        + '앞으로 오른다는 예측이 아니라, 이런 일이 있었다는 기록입니다.',
    }),
  ]);
}

/** 많을 때는 일부만 보여 주고 나머지는 눌러서 펼친다. */
function signalList(signals, periods) {
  const list = el('div', { class: 'signal-list' }, signals.slice(0, FIRST_PAGE).map((s) => signalCard(s, periods)));
  if (signals.length <= FIRST_PAGE) return list;

  const more = el('button', {
    type: 'button',
    class: 'more',
    text: `나머지 ${signals.length - FIRST_PAGE}건 더 보기`,
    onclick: () => {
      list.append(...signals.slice(FIRST_PAGE).map((s) => signalCard(s, periods)));
      more.remove();
    },
  });

  return el('div', {}, [list, more]);
}

export async function renderReview(root, { range, settings }) {
  root.replaceChildren(el('p', { class: 'empty', text: '불러오는 중…' }));

  let signals;
  try {
    signals = await attachPerformance(await loadSignals(range), settings.candleUnit);
  } catch {
    root.replaceChildren(
      el('p', { class: 'range', text: range.label }),
      el('p', { class: 'error', text: '지난 알림 기록을 불러오지 못했습니다. 잠시 뒤 다시 열어 보세요.' }),
    );
    return;
  }

  if (signals.length === 0) {
    root.replaceChildren(
      el('p', { class: 'range', text: range.label }),
      el('p', { class: 'empty', text: '이 기간에 온 알림이 없습니다.' }),
      el('p', { class: 'note', text: '알림이 나갈 때마다 여기에 쌓입니다.' }),
      legend(settings),
    );
    return;
  }

  const summary = overview(signals);
  const counts = `위로 ${summary.counts.golden} · 아래로 ${summary.counts.dead} · 근접 ${summary.counts.proximity}`;

  root.replaceChildren(
    el('p', { class: 'range', text: range.label }),

    el('div', { class: 'tiles' }, [
      tile('알림', `${summary.total}건`),
      tile('하루 뒤 평균', signed(summary.returns[24], 2, '%'), tone(summary.returns[24])),
    ]),
    el('p', { class: 'note tight', text: counts }),

    el('h2', { text: '신호별 성과' }),
    el('div', { class: 'signal-list' }, byType(signals).map((row) => statsCard(row, settings))),

    el('h2', { text: '받은 알림' }),
    signalList(signals, settings),

    el('p', {
      class: 'note',
      text: '성과는 알림이 온 시점의 가격과 비교한 값입니다. 아직 그 시간이 지나지 않았으면 —로 표시됩니다.',
    }),
    legend(settings),
  );
}
