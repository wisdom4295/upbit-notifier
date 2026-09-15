import { summarize } from './src/indicators.js';

const UPBIT = 'https://api.upbit.com/v1';
const STORAGE_KEY = 'upbit-notifier:markets';
const REFRESH_MS = 60_000;

const $ = (id) => document.getElementById(id);
let settings = { candleUnit: 15, periods: { short: 50, long: 200 }, proximityThresholdPct: 0.3 };
let markets = [];
let allMarkets = [];

/** 감시 목록: 로컬 저장값 > config.json 기본값 */
function readStoredMarkets() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return Array.isArray(stored) && stored.length > 0 ? stored : null;
  } catch {
    return null; // 사파리 프라이빗 모드 등에서 접근 실패
  }
}

function storeMarkets() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(markets));
  } catch {
    /* 저장 실패해도 화면은 동작해야 한다 */
  }
}

async function fetchCandles(market, unit, count) {
  const collected = [];
  let cursor = null;

  while (collected.length < count) {
    const remaining = Math.min(200, count - collected.length);
    const query = new URLSearchParams({ market, count: String(remaining) });
    if (cursor) query.set('to', cursor);

    const response = await fetch(`${UPBIT}/candles/minutes/${unit}?${query}`);
    if (!response.ok) throw new Error(`업비트 응답 ${response.status}`);

    const page = await response.json();
    if (page.length === 0) break;
    collected.push(...page);
    cursor = `${page.at(-1).candle_date_time_utc}Z`;
    if (page.length < remaining) break;
  }

  return collected
    .map((c) => ({ timeKst: c.candle_date_time_kst, close: c.trade_price }))
    .reverse();
}

const krw = (value) =>
  value >= 1000
    ? Math.round(value).toLocaleString('ko-KR')
    : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

function renderChips() {
  $('chips').replaceChildren(
    ...markets.map((market) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = market.replace('KRW-', '');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `${market} 제거`);
      remove.addEventListener('click', () => {
        markets = markets.filter((m) => m !== market);
        storeMarkets();
        renderChips();
        refresh();
      });

      chip.append(remove);
      return chip;
    }),
  );
}

function renderCards(rows) {
  const { short, long } = settings.periods;
  const container = $('cards');

  if (rows.length === 0) {
    container.innerHTML = '<p class="empty">감시 중인 코인이 없습니다.</p>';
    return;
  }

  // 이평선에 가까운 순서로 정렬 — 교차 임박 종목이 위로 온다.
  const sorted = [...rows].sort((a, b) => {
    if (!a.summary) return 1;
    if (!b.summary) return -1;
    return Math.abs(a.summary.gapPct) - Math.abs(b.summary.gapPct);
  });

  container.replaceChildren(
    ...sorted.map(({ market, summary, error }) => {
      const card = document.createElement('article');
      card.className = 'card';
      const coin = market.replace('KRW-', '');

      if (error || !summary) {
        card.innerHTML = `<div class="row"><span class="coin">${coin}</span></div>
          <div class="meta">${error ?? `캔들 부족 (MA${long} 계산 불가)`}</div>`;
        return card;
      }

      const gap = summary.gapPct;
      const tone = Math.abs(gap) <= settings.proximityThresholdPct ? 'near' : gap >= 0 ? 'up' : 'down';
      const width = Math.min(100, (Math.abs(gap) / (settings.proximityThresholdPct * 10)) * 100);

      card.innerHTML = `
        <div class="row">
          <span class="coin">${coin}</span>
          <span class="price">${krw(summary.price)}</span>
        </div>
        <div class="row" style="margin-top:6px">
          <span class="meta" style="margin:0">MA${short} ${krw(summary.short)} · MA${long} ${krw(summary.long)}</span>
          <span class="gap ${tone}">${gap >= 0 ? '+' : ''}${gap.toFixed(3)}%</span>
        </div>
        <div class="bar gap ${tone}"><span style="width:${width}%"></span></div>
        <div class="meta"><span>${summary.time.replace('T', ' ')} KST</span>
          <a href="https://upbit.com/exchange?code=CRIX.UPBIT.${market}" target="_blank" rel="noopener">차트</a></div>
      `;
      return card;
    }),
  );
}

async function refresh() {
  const { short, long } = settings.periods;
  $('subtitle').textContent = `${settings.candleUnit}분봉 · MA${short} / MA${long} · 불러오는 중…`;

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

  renderCards(rows);
  $('subtitle').textContent =
    `${settings.candleUnit}분봉 · MA${short} / MA${long} · ${new Date().toLocaleTimeString('ko-KR')} 기준`;
}

function normalize(input) {
  const value = input.trim().toUpperCase();
  if (!value) return null;
  const market = value.includes('-') ? value : `KRW-${value}`;
  return allMarkets.length === 0 || allMarkets.includes(market) ? market : null;
}

async function init() {
  try {
    const config = await fetch('./config.json').then((r) => r.json());
    settings = {
      candleUnit: config.candleUnit ?? settings.candleUnit,
      periods: { ...settings.periods, ...config.periods },
      proximityThresholdPct: config.alerts?.proximityThresholdPct ?? settings.proximityThresholdPct,
    };
    markets = readStoredMarkets() ?? config.markets ?? [];
  } catch {
    markets = readStoredMarkets() ?? ['KRW-BTC'];
  }

  try {
    const list = await fetch(`${UPBIT}/market/all?isDetails=false`).then((r) => r.json());
    allMarkets = list.filter((m) => m.market.startsWith('KRW-')).map((m) => m.market);
    $('market-list').replaceChildren(
      ...allMarkets.map((market) => Object.assign(document.createElement('option'), { value: market.replace('KRW-', '') })),
    );
  } catch {
    /* 자동완성은 없어도 수동 입력으로 동작한다 */
  }

  renderChips();
  await refresh();

  const add = () => {
    const market = normalize($('market-input').value);
    if (!market) {
      $('subtitle').textContent = '해당 마켓을 찾을 수 없습니다.';
      return;
    }
    if (!markets.includes(market)) {
      markets.push(market);
      storeMarkets();
      renderChips();
      refresh();
    }
    $('market-input').value = '';
  };

  $('add').addEventListener('click', add);
  $('market-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') add();
  });
  $('refresh').addEventListener('click', refresh);

  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, REFRESH_MS);
}

init();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
