import { todayRange, weekRange } from './src/period.js';
import { loadMarkets, saveMarkets } from './web/store.js';
import { fetchKrwMarkets } from './web/upbit.js';
import { renderCurrent } from './web/current.js';
import { renderReview } from './web/review.js';
import { el, coinOf } from './web/format.js';

const REFRESH_MS = 60_000;
const $ = (id) => document.getElementById(id);

let settings = { candleUnit: 15, periods: { short: 50, long: 200 }, proximityThresholdPct: 0.3 };
let markets = [];       // 화면에 띄워 둔 목록
let alertMarkets = [];  // config.json 기준 = 실제로 알림이 오는 목록
let allMarkets = [];
let tab = 'current';

/**
 * GitHub Pages 주소에서 config.json 편집 링크를 만든다.
 * (https://<계정>.github.io/<레포>/ → github.com/<계정>/<레포>/edit/main/config.json)
 * 다른 곳에서 열었으면 링크를 만들 수 없으므로 null.
 */
function configEditUrl() {
  const owner = location.hostname.match(/^([\w-]+)\.github\.io$/)?.[1];
  const repo = location.pathname.split('/').filter(Boolean)[0];
  return owner && repo ? `https://github.com/${owner}/${repo}/edit/main/config.json` : null;
}

function renderChips() {
  const chips = markets.map((market) => {
    const alerting = alertMarkets.includes(market);
    return el('span', { class: `chip ${alerting ? 'alerting' : ''}` }, [
      coinOf(market),
      // 화면에만 추가한 코인은 알림이 오지 않는다. 그 차이를 칩에서 바로 보여 준다.
      el('span', {
        class: 'chip-tag',
        title: alerting ? '알림을 받는 코인입니다' : '이 브라우저에서 보기만 합니다',
        text: alerting ? '알림' : '보기만',
      }),
      el('button', {
        type: 'button',
        'aria-label': `${market} 목록에서 빼기`,
        text: '✕',
        onclick: () => {
          markets = markets.filter((m) => m !== market);
          saveMarkets(markets);
          renderChips();
          render();
        },
      }),
    ]);
  });

  const editUrl = configEditUrl();
  const note = el('p', { class: 'chips-note' }, [
    '🔔 ',
    el('strong', { text: '알림' }),
    '이 붙은 코인만 텔레그램으로 알림이 옵니다. 바꾸려면 ',
    editUrl
      ? el('a', { href: editUrl, target: '_blank', rel: 'noopener', text: 'config.json' })
      : el('code', { text: 'config.json' }),
    '의 markets를 고치세요. 여기서 추가한 코인은 이 브라우저에서 보기만 합니다.',
    markets.join() === alertMarkets.join()
      ? null
      : el('button', {
          type: 'button',
          class: 'link',
          text: '알림 목록으로 되돌리기',
          onclick: () => {
            markets = [...alertMarkets];
            saveMarkets(markets);
            renderChips();
            render();
          },
        }),
  ]);

  $('chips').replaceChildren(...chips, note);
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
    alertMarkets = config.markets ?? [];
    markets = loadMarkets() ?? [...alertMarkets];
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
