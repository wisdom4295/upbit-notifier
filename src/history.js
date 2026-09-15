import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = 'history';

/** 월별로 파일을 나눠 한 파일이 무한정 커지지 않게 한다. (예: 2026-09) */
export const monthKey = (isoUtc) => isoUtc.slice(0, 7);

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    // 파일이 깨졌다고 알림까지 멈출 수는 없다. 경고만 남기고 새로 쓴다.
    // (예전 내용은 레포 커밋 기록에 남아 있다.)
    console.warn(`${path}를 읽을 수 없어 새로 씁니다: ${error.message}`);
    return fallback;
  }
}

/**
 * 발생한 시그널을 월별 파일에 append 하고, 브라우저가 어떤 달이 있는지
 * 알 수 있도록 index.json을 갱신한다.
 *
 * @param {{ts: string, kst: string, market: string, type: string, price: number,
 *          short: number, long: number, gapPct: number}[]} records
 * @returns {Promise<number>} 실제로 추가된 건수 (중복 제외)
 */
export async function appendSignals(records, dir = DIR) {
  if (records.length === 0) return 0;
  await mkdir(dir, { recursive: true });

  const byMonth = new Map();
  for (const record of records) {
    const month = monthKey(record.ts);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(record);
  }

  let added = 0;
  for (const [month, incoming] of byMonth) {
    const path = join(dir, `${month}.json`);
    const existing = await readJson(path, []);
    // state.json이 이미 막아 주지만, 수동 실행 등으로 겹칠 때를 대비해 한 번 더 거른다.
    const seen = new Set(existing.map((r) => `${r.market}|${r.type}|${r.ts}`));
    const fresh = incoming.filter((r) => !seen.has(`${r.market}|${r.type}|${r.ts}`));
    if (fresh.length === 0) continue;

    const merged = [...existing, ...fresh].sort((a, b) => a.ts.localeCompare(b.ts));
    await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
    added += fresh.length;
  }

  if (added > 0) await writeIndex(dir);
  return added;
}

/** 기간이 걸쳐 있는 달 목록 ('2026-08', '2026-09' …) */
function monthsInRange(from, to) {
  const months = new Set([from.slice(0, 7)]);
  const end = to.slice(0, 7);
  let cursor = from.slice(0, 7);
  while (cursor < end) {
    const [year, month] = cursor.split('-').map(Number);
    cursor = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
    months.add(cursor);
  }
  return [...months];
}

/**
 * 기간(KST) 안에 발생한 신호를 오래된 순으로 읽는다.
 * 파일이 없으면 그 기간에 알림이 없었다는 뜻이므로 빈 배열이다.
 */
export async function readSignals({ from, to }, dir = DIR) {
  const pages = await Promise.all(
    monthsInRange(from, to).map((month) => readJson(join(dir, `${month}.json`), [])),
  );

  return pages
    .flat()
    .filter((record) => record.kst >= from && record.kst < to)
    .sort((a, b) => a.kst.localeCompare(b.kst));
}

/** history 폴더를 훑어 사용 가능한 달 목록을 index.json으로 남긴다. */
export async function writeIndex(dir = DIR) {
  const files = await readdir(dir).catch(() => []);
  const months = files
    .filter((name) => /^\d{4}-\d{2}\.json$/.test(name))
    .map((name) => name.replace('.json', ''))
    .sort();

  await writeFile(
    join(dir, 'index.json'),
    `${JSON.stringify({ months, updatedUtc: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );
  return months;
}
