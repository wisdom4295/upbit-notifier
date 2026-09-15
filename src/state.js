import { readFile, writeFile } from 'node:fs/promises';

const EMPTY = { markets: {} };

/** 알림 중복 발송을 막기 위한 상태. 워크플로가 레포에 커밋해 유지한다. */
export async function loadState(path = 'state.json') {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return { ...EMPTY, ...parsed, markets: parsed.markets ?? {} };
  } catch (error) {
    if (error.code === 'ENOENT') return structuredClone(EMPTY); // 최초 실행
    throw error;
  }
}

export async function saveState(state, path = 'state.json') {
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

export function getMarketState(state, market) {
  return state.markets[market] ?? { lastCheckedUtc: null, lastSignalUtc: {} };
}

export function setMarketState(state, market, value) {
  state.markets[market] = value;
}
