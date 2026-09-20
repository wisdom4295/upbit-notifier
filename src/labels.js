/**
 * 신호 이름을 차트에서 쓰는 숫자 그대로 만든다. ("50선이 200선 위로")
 * 기간이 설정값이므로 라벨도 설정에서 만들어 낸다.
 * 알림(Node)과 대시보드(브라우저)가 같은 문구를 쓰도록 여기 모아 둔다.
 */
// 색은 방향 하나만 뜻한다. 초록=위로, 빨강=아래로, 노랑=거의 닿음.
// 무엇이 무엇을 뚫었는지는 글로 읽게 두고, 외울 것은 색 세 개로 끝낸다.
const EMOJI = { golden: '🟢', dead: '🔴', proximity: '🟡', breakUp: '🟢', breakDown: '🔴' };

/**
 * @returns {{emoji: string, brief: string, headline: string, full: string}}
 *   brief = 좁은 칸용 짧은 이름
 *   headline = 알림 첫 줄. 폰 배너에 이 줄만 보이므로 무슨 일인지가 여기 있어야 한다.
 *   full = 문장으로 읽히는 설명
 */
export function signalLabel(type, { short, long, vwmaDays, unit }) {
  const brief = {
    golden: `${short}선 위로`,
    dead: `${short}선 아래로`,
    proximity: `${short}선 근접`,
    breakUp: `${vwmaDays}일선 상향 돌파`,
    breakDown: `${vwmaDays}일선 하향 돌파`,
  }[type];

  const headline = {
    golden: `${short}선이 ${long}선 위로`,
    dead: `${short}선이 ${long}선 아래로`,
    proximity: `${short}선이 ${long}선에 근접`,
    // 폰 배너에는 이 줄만 보인다. 무엇이 무엇을 뚫었는지가 여기서 다 읽혀야 한다.
    breakUp: `${unit}분봉 캔들이 ${vwmaDays}일 거래량가중 이동평균선 상향 돌파`,
    breakDown: `${unit}분봉 캔들이 ${vwmaDays}일 거래량가중 이동평균선 하향 돌파`,
  }[type];

  const full = {
    golden: `${short}선이 ${long}선을 아래에서 위로 뚫었습니다.`,
    dead: `${short}선이 ${long}선을 위에서 아래로 뚫었습니다.`,
    proximity: `${short}선이 ${long}선에 거의 닿았습니다. 곧 뚫을 수 있습니다.`,
    breakUp: `${unit}분봉 캔들이 ${vwmaDays}일 거래량가중 이동평균선을 아래에서 위로 뚫었습니다.`,
    breakDown: `${unit}분봉 캔들이 ${vwmaDays}일 거래량가중 이동평균선을 위에서 아래로 뚫었습니다.`,
  }[type];

  if (!brief) return { emoji: '', brief: type, headline: type, full: '' };
  return { emoji: EMOJI[type], brief, headline, full };
}

/** 이모지까지 붙인 표시용 이름 */
export const signalName = (type, periods) => {
  const { emoji, brief } = signalLabel(type, periods);
  return emoji ? `${emoji} ${brief}` : brief;
};

/** "50봉"이 실제로 몇 시간인지 감이 오도록 바꿔 준다. */
export function duration(bars, unitMinutes) {
  const minutes = bars * unitMinutes;
  if (minutes < 60) return `${minutes}분`;

  const hours = minutes / 60;
  if (hours < 48) return `${Number(hours.toFixed(1))}시간`;
  return `${Number((hours / 24).toFixed(1))}일`;
}
