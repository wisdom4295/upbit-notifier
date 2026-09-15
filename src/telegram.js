import { signalLabel, signalName } from './labels.js';

const API_BASE = 'https://api.telegram.org';

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 텔레그램은 한 대화방에 초당 1건 정도만 받는다. 코인을 여럿 감시하면 한 번에
// 여러 건이 몰리므로, 간격을 두고 보내고 429는 알려 준 시간만큼 기다렸다 다시 보낸다.
const MIN_GAP_MS = 1100;
const MAX_RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let lastSentAt = 0;

async function post(token, chatId, text) {
  const gap = Date.now() - lastSentAt;
  if (gap < MIN_GAP_MS) await sleep(MIN_GAP_MS - gap);
  lastSentAt = Date.now();

  return fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  });
}

export async function sendMessage(text, { token, chatId, dryRun = false } = {}) {
  if (dryRun) {
    console.log('--- [dry-run] 전송하지 않고 출력 ---\n' + text + '\n---------------------------------');
    return;
  }
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 설정되지 않았습니다.');
  }

  for (let attempt = 0; ; attempt += 1) {
    const response = await post(token, chatId, text);
    if (response.ok) return;

    const body = await response.text();
    const retriable = response.status === 429 || response.status >= 500;
    if (!retriable || attempt === MAX_RETRIES) {
      // 텔레그램은 실패 사유를 본문에 담아 주므로 그대로 노출한다.
      throw new Error(`텔레그램 전송 실패 ${response.status}: ${body}`);
    }

    // 429면 retry_after(초)를 그대로 따르고, 그 밖에는 점점 늘려 가며 재시도한다.
    const retryAfter = Number(JSON.parse(body || '{}')?.parameters?.retry_after) || 0;
    const wait = retryAfter > 0 ? retryAfter * 1000 + 200 : 2 ** attempt * 1000;
    console.warn(`텔레그램 ${response.status} — ${Math.round(wait / 100) / 10}초 후 재시도`);
    await sleep(wait);
  }
}

const krw = (value) =>
  value >= 1000
    ? Math.round(value).toLocaleString('ko-KR')
    : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

/**
 * 봇이 받은 새 메시지를 가져온다. offset을 주면 그보다 앞선 것은 지워지므로
 * 같은 명령을 두 번 처리하지 않는다.
 */
export async function fetchUpdates({ token, offset } = {}) {
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN 이 설정되지 않았습니다.');

  const query = new URLSearchParams({ timeout: '0', allowed_updates: '["message"]' });
  if (offset) query.set('offset', String(offset));

  const response = await fetch(`${API_BASE}/bot${token}/getUpdates?${query}`);
  if (!response.ok) throw new Error(`텔레그램 조회 실패 ${response.status}: ${await response.text()}`);

  const body = await response.json();
  if (!body.ok) throw new Error(`텔레그램 조회 실패: ${JSON.stringify(body)}`);
  return body.result ?? [];
}

/** 시그널 1건을 텔레그램 메시지로 변환한다. */
export function formatSignal(signal, { market, unit, short, long }) {
  const coin = market.split('-')[1];
  // 마켓 코드는 config 검증을 통과한 값이지만, 링크에 그대로 끼워 넣으면
  // 검증이 느슨해지는 날 HTML이 깨진다. URL·HTML 양쪽으로 한 번씩 막아 둔다.
  const chartUrl = escapeHtml(`https://upbit.com/exchange?code=CRIX.UPBIT.${encodeURIComponent(market)}`);
  const { emoji, full } = signalLabel(signal.type, { short, long });
  const side = signal.gapPct >= 0 ? `${short}선이 위` : `${short}선이 아래`;

  return [
    `${emoji} <b>${escapeHtml(coin)}</b> (${unit}분봉)`,
    full,
    '',
    `현재가: <b>${krw(signal.candle.close)}</b>`,
    `${short}선: ${krw(signal.short)}`,
    `${long}선: ${krw(signal.long)}`,
    `두 선 차이: <b>${signal.gapPct.toFixed(3)}%</b> (${side})`,
    `기준 캔들: ${escapeHtml(signal.candle.timeKst.replace('T', ' '))} KST`,
    '',
    `<a href="${chartUrl}">업비트에서 보기</a>`,
  ].join('\n');
}

/** 시그널이 없을 때 쓰는 현재 상태 요약(수동 실행/점검용). */
export function formatStatus(summaries, { unit, short, long }) {
  const lines = summaries.map(({ market, summary }) => {
    const coin = market.split('-')[1];
    if (!summary) return `• ${escapeHtml(coin)}: 캔들 데이터 부족`;
    const side = summary.gapPct >= 0 ? '▲' : '▼';
    return `• <b>${escapeHtml(coin)}</b> ${krw(summary.price)} · 두 선 차이 ${side} ${summary.gapPct.toFixed(3)}%`;
  });

  return [
    `📊 현재 상태 (${unit}분봉 · ${short}선 / ${long}선)`,
    '',
    ...lines,
  ].join('\n');
}
