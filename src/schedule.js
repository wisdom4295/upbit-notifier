/**
 * 리포트를 보낼 때가 됐는지 스스로 판단한다.
 *
 * GitHub의 cron은 몇 시간씩 건너뛸 수 있어 "밤 10시에 실행"을 믿을 수 없다.
 * 그래서 실행될 때마다 "오늘 것을 아직 안 보냈고 밤 10시가 지났는가"를 보고
 * 늦게라도 한 번은 보내도록 한다. 무엇으로 깨우든 결과가 같아진다.
 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const kstParts = (epochMs) => {
  const kst = new Date(epochMs + KST_OFFSET_MS);
  return { date: kst.toISOString().slice(0, 10), hour: kst.getUTCHours(), weekday: kst.getUTCDay() };
};

/** 그 주 월요일 날짜. 한 주에 한 번만 보내기 위한 열쇠로 쓴다. */
export function weekKey(epochMs) {
  const { date, weekday } = kstParts(epochMs);
  const monday = new Date(Date.parse(`${date}T00:00:00Z`) - ((weekday + 6) % 7) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * @returns {('daily'|'weekly')[]} 지금 보내야 할 리포트
 */
export function dueReports(state = {}, epochMs = Date.now(), { hour = 22 } = {}) {
  const { date, hour: nowHour, weekday } = kstParts(epochMs);
  const due = [];

  if (nowHour >= hour && state.lastDailyReport !== date) due.push('daily');

  // 주간은 일요일 밤에 그 주를 마무리한다.
  if (weekday === 0 && nowHour >= hour && state.lastWeeklyReport !== weekKey(epochMs)) due.push('weekly');

  return due;
}

/** 보낸 뒤 기록해 같은 날 두 번 보내지 않게 한다. */
export function markReportSent(state, period, epochMs = Date.now()) {
  if (period === 'daily') state.lastDailyReport = kstParts(epochMs).date;
  if (period === 'weekly') state.lastWeeklyReport = weekKey(epochMs);
  return state;
}
