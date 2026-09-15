import { todayRange, weekRange } from './src/period.js';
import { renderCurrent } from './web/current.js';
import { renderReview } from './web/review.js';
import { el, nodes, coinOf } from './web/format.js';

const REFRESH_MS = 60_000;
const $ = (id) => document.getElementById(id);

let settings = { candleUnit: 15, periods: { short: 50, long: 200 }, proximityThresholdPct: 0.3 };
let markets = [];
let tab = 'current';

/**
 * GitHub Pages 주소에서 config.json 편집 링크를 만든다.
 * (https://<계정>.github.io/<레포>/ → github.com/<계정>/<레포>/edit/main/config.json)
 * 다른 곳에서 열었으면 만들 수 없으므로 null.
 */
function configEditUrl() {
  const owner = location.hostname.match(/^([\w-]+)\.github\.io$/)?.[1];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return owner && repo ? `https://github.com/${owner}/${repo}/edit/main/config.json` : null;
}

/** 감시 목록은 config.json 하나뿐이다. 화면에서는 무엇을 보는지만 알려 준다. */
function renderWatchlist() {
  const editUrl = configEditUrl();
  const names = markets.map(coinOf).join(', ');

  // replaceChildren은 el()과 달리 null을 걸러 주지 않고 "null" 글자로 넣는다.
  $('watchlist').replaceChildren(
    ...nodes(
      el('span', { text: `알림 받는 코인 ${markets.length}개 · ` }),
      el('span', { class: 'watchlist-names', text: names || '없음' }),
      editUrl && ' · ',
      editUrl && el('a', { href: editUrl, target: '_blank', rel: 'noopener', text: '바꾸기' }),
    ),
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
