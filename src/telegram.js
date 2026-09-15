import { signalLabel, signalName } from './labels.js';

const API_BASE = 'https://api.telegram.org';

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function sendMessage(text, { token, chatId, dryRun = false } = {}) {
  if (dryRun) {
    console.log('--- [dry-run] 전송하지 않고 출력 ---\n' + text + '\n---------------------------------');
    return;
  }
  if (!token || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 가 설정되지 않았습니다.');
  }

  const response = await fetch(`${API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    // 텔레그램은 실패 사유를 본문에 담아 주므로 그대로 노출한다.
    throw new Error(`텔레그램 전송 실패 ${response.status}: ${await response.text()}`);
  }
}

const krw = (value) =>
  value >= 1000
    ? Math.round(value).toLocaleString('ko-KR')
    : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

/** 시그널 1건을 텔레그램 메시지로 변환한다. */
export function formatSignal(signal, { market, unit, short, long }) {
  const coin = market.split('-')[1];
  const chartUrl = `https://upbit.com/exchange?code=CRIX.UPBIT.${market}`;
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
