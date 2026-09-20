/**
 * 리포트를 보낼 때가 됐는지 스스로 판단한다.
 *
 * 선이 모두 일봉이라 하루는 자정에 마감된다. 그래서 자정을 넘긴 뒤
 * **방금 끝난 하루**를 정리해 보낸다. 교차 알림도 같은 자리에서 나가므로
 * 알림이 먼저, 리포트가 뒤에 도착한다.
 *
 * GitHub의 cron은 몇 시간씩 건너뛸 수 있어 시각을 믿을 수 없다. 실행될 때마다
 * "그 하루 것을 아직 안 보냈는가"를 보고 늦게라도 한 번은 보낸다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const kstParts = (epochMs) => {
  const kst = new Date(epochMs + KST_OFFSET_MS);
  return { date: kst.toISOString().slice(0, 10), hour: kst.getUTCHours(), weekday: kst.getUTCDay() };
};

const DAY_MS = 86_400_000;

/** 그 전날 (KST 달력 기준) */
const previousDate = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

/** 그 주 월요일 날짜. 한 주에 한 번만 보내기 위한 열쇠로 쓴다. */
export function weekKey(epochMs) {
  const { date, weekday } = kstParts(epochMs);
  const monday = new Date(Date.parse(`${date}T00:00:00Z`) - ((weekday + 6) % 7) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** 방금 마감된 하루 · 한 주를 가리키는 열쇠 */
const lastDayKey = (epochMs) => previousDate(kstParts(epochMs).date);
const lastWeekKey = (epochMs) => weekKey(epochMs - DAY_MS);

/**
 * @param {{hour?: number}} options hour 이후에만 보낸다. 0이면 자정 직후.
 * @returns {('daily'|'weekly')[]} 지금 보내야 할 리포트
 */
export function dueReports(state = {}, epochMs = Date.now(), { hour = 0 } = {}) {
  const { hour: nowHour, weekday } = kstParts(epochMs);
  const due = [];
  if (nowHour < hour) return due;

  if (state.lastDailyReport !== lastDayKey(epochMs)) due.push('daily');

  // 주간은 월요일에, 막 끝난 한 주(월~일)를 정리한다.
  if (weekday === 1 && state.lastWeeklyReport !== lastWeekKey(epochMs)) due.push('weekly');

  return due;
}

/** 보낸 뒤 기록해 같은 기간을 두 번 보내지 않게 한다. */
export function markReportSent(state, period, epochMs = Date.now()) {
  if (period === 'daily') state.lastDailyReport = lastDayKey(epochMs);
  if (period === 'weekly') state.lastWeeklyReport = lastWeekKey(epochMs);
  return state;
}
