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

/**
 * 방금 마감된 하루(어제 0시 ~ 오늘 0시).
 * 하루가 끝나야 그날을 정리할 수 있다. 자정을 넘긴 뒤 어제를 보낸다.
 */
export function lastDayRange(epochMs = Date.now()) {
  const today = kstDate(epochMs);
  const date = shiftDate(today, -1);
  return { from: `${date}T00:00:00`, to: `${today}T00:00:00`, label: date };
}

/** 방금 마감된 한 주(지난 월요일 0시 ~ 이번 월요일 0시) */
export function lastWeekRange(epochMs = Date.now()) {
  const date = kstDate(epochMs);
  const thisMonday = shiftDate(date, -((weekday(date) + 6) % 7));
  const lastMonday = shiftDate(thisMonday, -7);
  return {
    from: `${lastMonday}T00:00:00`,
    to: `${thisMonday}T00:00:00`,
    label: `${lastMonday} ~ ${shiftDate(thisMonday, -1)}`,
  };
}
