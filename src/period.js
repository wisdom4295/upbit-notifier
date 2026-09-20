/**
 * 회고 기간 계산. 업비트가 KST 기준이라 "오늘/이번 주"도 KST로 자른다.
 * 이력 레코드의 `kst` 필드("2026-09-15T14:30:00")와 문자열로 바로 비교할 수 있는
 * 형태를 돌려주므로, 보는 사람의 브라우저 시간대와 무관하게 결과가 같다.
 */
const DAY_MS = 86_400_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // 한국은 서머타임이 없어 고정 오프셋

/** epoch → KST 달력 날짜 'YYYY-MM-DD' */
export const kstDate = (epochMs = Date.now()) =>
  new Date(epochMs + KST_OFFSET_MS).toISOString().slice(0, 10);

const shiftDate = (dateString, days) =>
  new Date(Date.parse(`${dateString}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** 0=일 … 6=토 */
const weekday = (dateString) => new Date(`${dateString}T00:00:00Z`).getUTCDay();

/** 오늘(KST) 0시부터 내일 0시까지 */
export function todayRange(epochMs = Date.now()) {
  const date = kstDate(epochMs);
  return { from: `${date}T00:00:00`, to: `${shiftDate(date, 1)}T00:00:00`, label: date };
}

/** 이번 주(KST, 월요일 시작) */
export function weekRange(epochMs = Date.now()) {
  const date = kstDate(epochMs);
  const monday = shiftDate(date, -((weekday(date) + 6) % 7));
  const nextMonday = shiftDate(monday, 7);
  return {
    from: `${monday}T00:00:00`,
    to: `${nextMonday}T00:00:00`,
    label: `${monday} ~ ${shiftDate(nextMonday, -1)}`,
  };
}
