/**
 * 텔레그램으로 받은 명령을 해석해 감시 목록을 바꾼다.
 * 순수 함수만 두어 네트워크·파일 없이 시험할 수 있게 한다.
 */

// 코인이 늘수록 매 실행의 업비트 호출도 늘어난다. 한도에 여유를 두고 제한한다.
export const MAX_MARKETS = 20;

const HELP = [
  '쓸 수 있는 명령입니다.',
  '',
  '/list — 지금 알림 받는 코인',
  '/add 도지 — 코인 추가 (예: /add DOGE)',
  '/remove 리플 — 코인 빼기 (예: /remove XRP)',
  '/status — 지금 시세와 두 선 위치',
  '/id — 이 방의 번호 (다른 방으로 옮길 때)',
].join('\n');

/**
 * "/add doge" → { name: 'add', arg: 'doge' }
 * 그룹에서는 "/add@봇이름 doge" 로 오므로 @뒤는 떼어 낸다.
 * 명령이 아니면 null.
 */
export function parseCommand(text = '') {
  const trimmed = String(text).trim();
  if (!trimmed.startsWith('/')) return null;

  const [head, ...rest] = trimmed.split(/\s+/);
  const name = head.slice(1).split('@')[0].toLowerCase();
  if (!name) return null;

  return { name, arg: rest.join(' ').trim() };
}

/** "doge" → "KRW-DOGE", "KRW-DOGE" → 그대로 */
function toMarket(value) {
  const code = value.trim().toUpperCase();
  if (!code) return null;
  return code.includes('-') ? code : `KRW-${code}`;
}

const listReply = (markets) =>
  markets.length === 0
    ? '알림 받는 코인이 없습니다. /add 로 추가하세요.'
    : `알림 받는 코인 ${markets.length}개\n\n${markets.map((m) => `· ${m.replace('KRW-', '')}`).join('\n')}`;

/**
 * @param {{name: string, arg: string}} command
 * @param {{markets: string[], availableMarkets?: string[], chatId?: string|number}} context
 * @returns {{markets: string[], reply: string, changed: boolean}}
 */
export function applyCommand(command, { markets, availableMarkets = [], chatId } = {}) {
  const keep = (reply) => ({ markets, reply, changed: false });

  switch (command.name) {
    case 'start':
    case 'help':
      return keep(HELP);

    case 'id':
      return keep(`이 방의 번호는 ${chatId ?? '(알 수 없음)'} 입니다.`);

    case 'list':
      return keep(listReply(markets));

    case 'add': {
      const market = toMarket(command.arg);
      if (!market) return keep('추가할 코인을 적어 주세요. 예: /add DOGE');
      // 업비트 목록을 못 받아온 경우엔 검사를 건너뛰고 받아 준다.
      if (availableMarkets.length > 0 && !availableMarkets.includes(market)) {
        return keep(`업비트에 ${market.replace('KRW-', '')} 은(는) 없습니다. 코인 기호를 확인해 주세요.`);
      }
      if (markets.includes(market)) return keep(`${market.replace('KRW-', '')} 은(는) 이미 받고 있습니다.`);
      if (markets.length >= MAX_MARKETS) {
        return keep(`코인은 최대 ${MAX_MARKETS}개까지 받을 수 있습니다. 먼저 /remove 로 빼 주세요.`);
      }

      const next = [...markets, market];
      return { markets: next, changed: true, reply: `${market.replace('KRW-', '')} 추가했습니다. 이제 ${next.length}개입니다.` };
    }

    case 'remove': {
      const market = toMarket(command.arg);
      if (!market) return keep('뺄 코인을 적어 주세요. 예: /remove XRP');
      if (!markets.includes(market)) return keep(`${market.replace('KRW-', '')} 은(는) 목록에 없습니다.`);

      const next = markets.filter((m) => m !== market);
      const tail = next.length === 0 ? ' 이제 알림 받는 코인이 없습니다.' : ` 이제 ${next.length}개입니다.`;
      return { markets: next, changed: true, reply: `${market.replace('KRW-', '')} 뺐습니다.${tail}` };
    }

    case 'status':
      return { markets, reply: null, changed: false }; // 시세는 호출한 쪽에서 붙인다

    default:
      return keep(`모르는 명령입니다: /${command.name}\n\n${HELP}`);
  }
}
