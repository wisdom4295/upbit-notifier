/**
 * 신호 이름을 차트에서 쓰는 숫자 그대로 만든다. ("50선이 200선 위로")
 * 기간이 설정값이므로 라벨도 설정에서 만들어 낸다.
 * 알림(Node)과 대시보드(브라우저)가 같은 문구를 쓰도록 여기 모아 둔다.
 */
const EMOJI = { golden: '🟢', dead: '🔴', proximity: '🟡' };

/**
 * @returns {{emoji: string, brief: string, full: string}}
 *   brief = 표 한 칸에 들어갈 짧은 이름, full = 문장으로 읽히는 설명
 */
export function signalLabel(type, { short, long }) {
  const brief = {
    golden: `${short}선 위로`,
    dead: `${short}선 아래로`,
    proximity: `${short}선 근접`,
  }[type];

  const full = {
    golden: `${short}선이 ${long}선을 아래에서 위로 뚫었습니다.`,
    dead: `${short}선이 ${long}선을 위에서 아래로 뚫었습니다.`,
    proximity: `${short}선이 ${long}선에 거의 닿았습니다. 곧 뚫을 수 있습니다.`,
  }[type];

  if (!brief) return { emoji: '', brief: type, full: '' };
  return { emoji: EMOJI[type], brief, full };
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
