import { todayRange, weekRange } from './src/period.js';
import { renderCurrent } from './web/current.js';
import { renderReview } from './web/review.js';
import { el, nodes, coinOf } from './web/format.js';

const REFRESH_MS = 60_000;
const $ = (id) => document.getElementById(id);

let settings = { candleUnit: 15, periods: { short: 50, long: 200 }, proximityThresholdPct: 0.3 };
let markets = [];
let tab = 'current';

/** 감시 목록은 config.json 하나뿐이다. 화면에서는 무엇을 보는지만 알려 준다. */
function renderWatchlist() {
  const names = markets.map(coinOf).join(', ');

  // 바꾸는 창구는 텔레그램이다. 폰에서 코드 화면으로 보내지 않는다.
  $('watchlist').replaceChildren(
    el('span', { text: `알림 받는 코인 ${markets.length}개 · ` }),
    el('span', { class: 'watchlist-names', text: names || '없음' }),
    el('span', { class: 'watchlist-hint', text: '텔레그램에서 /add, /remove 로 바꿉니다' }),
  );
}

async function render() {
  const { short, long } = settings.periods;
  $('subtitle').textContent = `${settings.candleUnit}분봉 · ${short}선 / ${long}선`;
  $('tab-current').hidden = tab !== 'current';
  $('tab-review').hidden = tab === 'current';

  if (tab === 'current') {
    $('cards').replaceChildren(el('p', { class: 'empty', text: '불러오는 중…' }));
    await renderCurrent($('cards'), { markets, settings });
    $('subtitle').textContent += ` · ${new Date().toLocaleTimeString('ko-KR')} 기준`;
    return;
  }

  await renderReview($('tab-review'), {
    range: tab === 'today' ? todayRange() : weekRange(),
    settings: { ...settings, ...settings.periods },
  });
}

function selectTab(next) {
  tab = next;
  for (const button of document.querySelectorAll('.tab')) {
    button.setAttribute('aria-selected', String(button.dataset.tab === next));
  }
  render();
}

async function init() {
  try {
    const config = await fetch('./config.json').then((r) => r.json());
    settings = {
      candleUnit: config.candleUnit ?? settings.candleUnit,
      periods: { ...settings.periods, ...config.periods },
      proximityThresholdPct: config.alerts?.proximityThresholdPct ?? settings.proximityThresholdPct,
    };
    markets = config.markets ?? [];
  } catch {
    $('watchlist').textContent = '설정을 불러오지 못했습니다.';
  }

  renderWatchlist();
  for (const button of document.querySelectorAll('.tab')) {
    button.addEventListener('click', () => selectTab(button.dataset.tab));
  }

  await render();

  // 시세만 자동으로 새로 받는다. 지난 알림 기록은 바뀌지 않으므로 갱신하지 않는다.
  setInterval(() => {
    if (document.visibilityState === 'visible' && tab === 'current') render();
  }, REFRESH_MS);
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
