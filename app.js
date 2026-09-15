import { todayRange, weekRange } from './src/period.js';
import { loadMarkets, saveMarkets } from './web/store.js';
import { fetchKrwMarkets } from './web/upbit.js';
import { renderCurrent } from './web/current.js';
import { renderReview } from './web/review.js';
import { el, coinOf } from './web/format.js';

const REFRESH_MS = 60_000;
const $ = (id) => document.getElementById(id);

let settings = { candleUnit: 15, periods: { short: 50, long: 200 }, proximityThresholdPct: 0.3 };
let markets = [];
let allMarkets = [];
let tab = 'current';

function renderChips() {
  $('chips').replaceChildren(
    ...markets.map((market) =>
      el('span', { class: 'chip' }, [
        coinOf(market),
        el('button', {
          type: 'button',
          'aria-label': `${market} 제거`,
          text: '✕',
          onclick: () => {
            markets = markets.filter((m) => m !== market);
            saveMarkets(markets);
            renderChips();
            render();
          },
        }),
      ]),
    ),
  );
}

async function render() {
  const { short, long } = settings.periods;
  $('subtitle').textContent = `${settings.candleUnit}분봉 · ${short}선 / ${long}선`;
  $('tab-current').hidden = tab !== 'current';
  $('tab-review').hidden = tab === 'current';
  // 감시 목록 편집은 '현재' 탭의 일이라 회고 탭에서는 감춰 화면을 비운다.
  $('watchlist').hidden = tab !== 'current';

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

function addMarket() {
  const input = $('market-input');
  const value = input.value.trim().toUpperCase();
  if (!value) return;

  const market = value.includes('-') ? value : `KRW-${value}`;
  if (allMarkets.length > 0 && !allMarkets.includes(market)) {
    $('subtitle').textContent = '해당 마켓을 찾을 수 없습니다.';
    return;
  }
  if (!markets.includes(market)) {
    markets.push(market);
    saveMarkets(markets);
    renderChips();
    render();
  }
  input.value = '';
}

async function init() {
  try {
    const config = await fetch('./config.json').then((r) => r.json());
    settings = {
      candleUnit: config.candleUnit ?? settings.candleUnit,
      periods: { ...settings.periods, ...config.periods },
      proximityThresholdPct: config.alerts?.proximityThresholdPct ?? settings.proximityThresholdPct,
    };
    markets = loadMarkets() ?? config.markets ?? [];
  } catch {
    markets = loadMarkets() ?? ['KRW-BTC'];
  }

  try {
    allMarkets = await fetchKrwMarkets();
    $('market-list').replaceChildren(
      ...allMarkets.map((market) => el('option', { value: coinOf(market) })),
    );
  } catch {
    /* 자동완성이 없어도 직접 입력으로 동작한다 */
  }

  renderChips();
  for (const button of document.querySelectorAll('.tab')) {
    button.addEventListener('click', () => selectTab(button.dataset.tab));
  }
  $('add').addEventListener('click', addMarket);
  $('market-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') addMarket();
  });
  $('refresh').addEventListener('click', render);

  await render();

  setInterval(() => {
    if (document.visibilityState === 'visible' && tab === 'current') render();
  }, REFRESH_MS);
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
