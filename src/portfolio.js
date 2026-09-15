/**
 * 매매 기록으로 평균단가·실현손익을 계산한다. (이동평균법)
 *
 * 매수: 평단 = 총매수금액 / 보유수량
 * 매도: 실현손익 += (매도가 - 평단) × 수량, 평단은 그대로 유지
 *
 * 브라우저와 Node 양쪽에서 쓰므로 DOM·파일 접근을 하지 않는다.
 */

/** @typedef {{id: string, ts: string, market: string, side: 'buy'|'sell', price: number, quantity: number, memo?: string}} Trade */

/**
 * @param {Trade[]} trades
 * @returns {{positions: Object, realizedPnl: number, realizedEvents: Object[], warnings: string[]}}
 */
export function buildPositions(trades) {
  const positions = {};
  const warnings = [];
  // 기간별 회고를 하려면 실현손익이 "언제" 났는지 알아야 한다.
  const realizedEvents = [];
  let realizedPnl = 0;

  // 입력 순서와 무관하게 체결 시각 순으로 계산해야 평단이 맞는다.
  const ordered = [...trades].sort((a, b) => a.ts.localeCompare(b.ts));

  for (const trade of ordered) {
    const position = (positions[trade.market] ??= {
      quantity: 0,
      cost: 0, // 보유분의 총 매수금액
      avgPrice: 0,
      realizedPnl: 0,
      buyCount: 0,
      sellCount: 0,
    });

    if (trade.side === 'buy') {
      position.quantity += trade.quantity;
      position.cost += trade.price * trade.quantity;
      position.avgPrice = position.cost / position.quantity;
      position.buyCount += 1;
      continue;
    }

    // 보유수량보다 많이 판 기록은 계산이 뒤틀리므로 보유분까지만 반영하고 알린다.
    let quantity = trade.quantity;
    if (quantity > position.quantity) {
      warnings.push(
        `${trade.market}: ${trade.ts} 매도 수량(${trade.quantity})이 보유수량(${position.quantity})보다 많습니다.`,
      );
      quantity = position.quantity;
    }
    if (quantity === 0) continue;

    const profit = (trade.price - position.avgPrice) * quantity;
    position.realizedPnl += profit;
    realizedPnl += profit;
    realizedEvents.push({
      ts: trade.ts,
      market: trade.market,
      quantity,
      price: trade.price,
      avgPrice: position.avgPrice,
      profit,
    });
    position.quantity -= quantity;
    position.cost -= position.avgPrice * quantity;
    position.sellCount += 1;
    if (position.quantity <= 1e-12) {
      position.quantity = 0;
      position.cost = 0;
    }
  }

  return { positions, realizedPnl, realizedEvents, warnings };
}

/**
 * 현재가를 얹어 평가손익까지 계산한다.
 * @param {Trade[]} trades
 * @param {Record<string, number>} prices 마켓별 현재가 (없으면 평가손익 생략)
 */
export function summarizePortfolio(trades, prices = {}) {
  const { positions, realizedPnl, realizedEvents, warnings } = buildPositions(trades);
  let unrealizedPnl = 0;
  let holdingValue = 0;

  const rows = Object.entries(positions).map(([market, position]) => {
    const price = prices[market];
    const hasPrice = typeof price === 'number' && position.quantity > 0;
    const unrealized = hasPrice ? (price - position.avgPrice) * position.quantity : null;

    if (unrealized !== null) {
      unrealizedPnl += unrealized;
      holdingValue += price * position.quantity;
    }

    return {
      market,
      ...position,
      price: hasPrice ? price : null,
      unrealizedPnl: unrealized,
      returnPct: unrealized !== null && position.cost > 0 ? (unrealized / position.cost) * 100 : null,
    };
  });

  return {
    rows: rows.sort((a, b) => b.quantity * (b.price ?? b.avgPrice) - a.quantity * (a.price ?? a.avgPrice)),
    realizedPnl,
    realizedEvents,
    unrealizedPnl,
    holdingValue,
    warnings,
  };
}

/** 기간 필터. from/to는 ISO 문자열, to는 미포함. */
export function withinRange(items, from, to, key = 'ts') {
  return items.filter((item) => item[key] >= from && item[key] < to);
}
