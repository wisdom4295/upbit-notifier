/**
 * 텔레그램으로 받은 명령을 해석해 감시 목록을 바꾼다.
 * 순수 함수만 두어 네트워크·파일 없이 시험할 수 있게 한다.
 *
 * 코인을 넣고 뺄 때는 이름을 그대로 믿지 않는다. 업비트에는 이름이 비슷한 코인이
 * 여럿 있어서 잘못 넣기 쉽다. 후보를 번호로 보여 주고 번호를 받아 확정한다.
 */

import { escapeHtml } from './html.js';

// 코인이 늘수록 매 실행의 업비트 호출도 늘어난다. 한도에 여유를 두고 제한한다.
export const MAX_MARKETS = 20;
// 한 번에 번호로 보여 줄 후보 수. 이보다 많으면 더 적어 달라고 한다.
export const MAX_CHOICES = 12;
// 번호를 기다리는 시간. 지나면 목록을 버린다.
export const PENDING_TTL_MS = 30 * 60 * 1000;

const HELP = [
  '쓸 수 있는 명령입니다.',
  '',
  '/list — 지금 알림 받는 코인',
  '/add 도지 — 코인 찾기 (나온 번호를 보내면 추가)',
  '/remove — 코인 빼기 (나온 번호를 보내면 제외)',
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

/** "3" 또는 "3번" 처럼 번호만 적은 답장이면 그 숫자를, 아니면 null */
export function parseNumber(text = '') {
  const trimmed = String(text).trim().replace(/번$/, '').trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * 받은 말 한 줄을 명령으로 바꾼다.
 * 번호만 적은 답장은 고를 목록이 있을 때만 명령으로 친다.
 * 그래야 단톡방의 평범한 대화에 봇이 끼어들지 않는다.
 */
export function interpret(text, { hasPending = false } = {}) {
  const command = parseCommand(text);
  if (command) {
    // "/3" 처럼 번호에 빗금을 붙여 보내는 경우도 받아 준다.
    if (/^\d{1,3}$/.test(command.name)) return { name: 'select', arg: command.name };
    return command;
  }

  const number = parseNumber(text);
  if (number !== null && hasPending) return { name: 'select', arg: String(number) };
  return null;
}

/** 업비트 목록은 {market, koreanName} 로 받지만 문자열 배열도 견딘다. */
const normalize = (available = []) =>
  available.map((item) => (typeof item === 'string' ? { market: item, koreanName: '' } : item));

/**
 * "비트코인 (BTC)" 처럼 사람이 읽는 이름.
 * 답장은 HTML로 나가므로 업비트에서 받은 이름도 걸러서 넣는다.
 */
export const naming = ({ market, koreanName }) => {
  const symbol = market.replace('KRW-', '');
  return escapeHtml(koreanName ? `${koreanName} (${symbol})` : symbol);
};

/** 후보를 "1. 도지코인 (DOGE)" 꼴로 번호를 붙여 늘어놓는다. */
export const numbered = (options) =>
  options.map((option, i) => `${i + 1}. ${naming(option)}`).join('\n');

/**
 * 적어 준 말로 업비트 마켓을 찾는다.
 * - 마켓 코드(KRW-DOGE), 기호(DOGE), 정확한 한글 이름(도지코인)이면 바로 확정한다.
 * - 이름이나 기호 일부만 적었으면 후보를 모아 돌려준다. 고르는 건 사람이 한다.
 *
 * @returns {{exact?: object, matches?: object[], notFound?: string}}
 */
export function searchMarkets(input, available = []) {
  const raw = String(input ?? '').trim();
  if (!raw) return { notFound: '' };

  const list = normalize(available);
  const upper = raw.toUpperCase();
  const code = upper.includes('-') ? upper : `KRW-${upper}`;

  // 업비트 목록을 못 받았으면 적어 준 대로 믿는다. 알림이 멈추는 것보다 낫다.
  if (list.length === 0) return { exact: { market: code, koreanName: '' } };

  const byCode = list.find((item) => item.market === code);
  if (byCode) return { exact: byCode };

  const byName = list.filter((item) => item.koreanName === raw);
  if (byName.length === 1) return { exact: byName[0] };

  const matches = list.filter(
    (item) => item.koreanName.includes(raw) || item.market.replace('KRW-', '').includes(upper),
  );
  if (matches.length === 0) return { notFound: raw };
  return { matches };
}

/**
 * @param {{name: string, arg: string}} command
 * @param {object} context
 * @param {string[]} context.markets 지금 알림 받는 마켓
 * @param {object[]} context.availableMarkets 업비트 전체 목록
 * @param {object|null} context.pending 번호를 기다리는 중인 목록
 * @param {number} context.now
 * @returns {{markets: string[], reply: string|null, changed: boolean, pending?: object|null}}
 *          pending 이 없으면 그대로 두고, null 이면 지우고, 값이 있으면 새로 기다린다.
 */
export function applyCommand(command, { markets, availableMarkets = [], chatId, pending = null, now = Date.now() } = {}) {
  const keep = (reply) => ({ markets, reply, changed: false });
  const available = normalize(availableMarkets);
  // 모르는 명령을 되읽어 줄 때도 사람이 적은 말이 그대로 나간다.
  const commandName = escapeHtml(command.name);

  /** 번호로 고를 목록을 띄운다. */
  const ask = (action, options, head) => ({
    markets,
    changed: false,
    pending: { action, options, createdAt: now },
    reply: [head, '', numbered(options), '', '번호만 적어서 보내 주세요. 그만두려면 /cancel'].join('\n'),
  });

  const addMarket = (option) => {
    const name = naming(option);
    if (markets.includes(option.market)) return { ...keep(`${name} — 이미 받고 있습니다.`), pending: null };
    if (markets.length >= MAX_MARKETS) {
      return { ...keep(`코인은 최대 ${MAX_MARKETS}개까지 받을 수 있습니다. 먼저 /remove 로 빼 주세요.`), pending: null };
    }
    const next = [...markets, option.market];
    return { markets: next, changed: true, pending: null, reply: `${name} 추가했습니다. 이제 ${next.length}개입니다.` };
  };

  const removeMarket = (option) => {
    const name = naming(option);
    if (!markets.includes(option.market)) return { ...keep(`${name} — 알림 목록에 없습니다.`), pending: null };
    const next = markets.filter((m) => m !== option.market);
    const tail = next.length === 0 ? ' 이제 알림 받는 코인이 없습니다.' : ` 이제 ${next.length}개입니다.`;
    return { markets: next, changed: true, pending: null, reply: `${name} 뺐습니다.${tail}` };
  };

  /** 지금 받고 있는 코인을 사람이 읽는 이름으로 */
  const watched = () =>
    markets.map((market) => available.find((item) => item.market === market) ?? { market, koreanName: '' });

  switch (command.name) {
    case 'start':
    case 'help':
      return keep(HELP);

    case 'id':
      return keep(`이 방의 번호는 ${chatId ?? '(알 수 없음)'} 입니다.`);

    case 'list': {
      if (markets.length === 0) return keep('알림 받는 코인이 없습니다. /add 로 추가하세요.');
      const lines = watched().map((option) => `· ${naming(option)}`);
      return keep(`알림 받는 코인 ${markets.length}개\n\n${lines.join('\n')}`);
    }

    case 'cancel':
      if (!pending) return keep('고르던 목록이 없습니다.');
      return { ...keep('그만뒀습니다.'), pending: null };

    case 'add': {
      if (!command.arg) {
        return keep('찾을 이름을 적어 주세요. 예: /add 도지\n이름 일부만 적어도 후보를 번호로 보여 드립니다.');
      }
      if (markets.length >= MAX_MARKETS) {
        return keep(`코인은 최대 ${MAX_MARKETS}개까지 받을 수 있습니다. 먼저 /remove 로 빼 주세요.`);
      }

      const asked = escapeHtml(command.arg);
      const found = searchMarkets(command.arg, available);
      if (found.exact) return addMarket(found.exact);
      if (found.notFound !== undefined) {
        return keep(`업비트에서 찾지 못했습니다: '${asked}'\n한글 이름 일부나 영문 기호로 적어 주세요. 예: /add 도지`);
      }
      if (found.matches.length > MAX_CHOICES) {
        return keep(`'${asked}' 검색 결과가 ${found.matches.length}개나 됩니다.\n이름을 조금 더 적어 주세요.`);
      }
      return ask('add', found.matches, `'${asked}' 검색 결과입니다. 추가할 번호를 보내 주세요.`);
    }

    case 'remove': {
      if (markets.length === 0) return keep('알림 받는 코인이 없습니다.');

      // 적지 않고 /remove 만 보내면 지금 받는 코인을 번호로 보여 준다.
      if (!command.arg) return ask('remove', watched(), '알림에서 뺄 번호를 보내 주세요.');

      const asked = escapeHtml(command.arg);
      const found = searchMarkets(command.arg, watched());
      if (found.exact) return removeMarket(found.exact);
      if (found.notFound !== undefined) {
        return keep(`알림 받는 코인에 없습니다: '${asked}'\n/list 로 확인해 보세요.`);
      }
      if (found.matches.length === 1) return removeMarket(found.matches[0]);
      return ask('remove', found.matches, `'${asked}' 검색 결과입니다. 뺄 번호를 보내 주세요.`);
    }

    case 'select': {
      if (!pending) return keep('고를 목록이 없습니다. 먼저 /add 로 코인을 찾아 주세요.');
      if (now - (pending.createdAt ?? 0) > PENDING_TTL_MS) {
        return { ...keep('고르던 목록이 오래돼 지웠습니다. /add 로 다시 찾아 주세요.'), pending: null };
      }

      const index = Number(command.arg) - 1;
      const option = pending.options?.[index];
      if (!option) {
        return keep(`1 ~ ${pending.options?.length ?? 0} 사이 번호를 보내 주세요.\n\n${numbered(pending.options ?? [])}`);
      }

      return pending.action === 'remove' ? removeMarket(option) : addMarket(option);
    }

    case 'status':
      return { markets, reply: null, changed: false }; // 시세는 호출한 쪽에서 붙인다

    default:
      return keep(`모르는 명령입니다: /${commandName}\n\n${HELP}`);
  }
}
