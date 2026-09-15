export const krw = (value) =>
  value === null || value === undefined
    ? '—'
    : Math.abs(value) >= 1000
      ? Math.round(value).toLocaleString('ko-KR')
      : value.toLocaleString('ko-KR', { maximumFractionDigits: 4 });

/** 손익·수익률처럼 부호가 의미 있는 값 */
export const signed = (value, digits = 2, suffix = '') => {
  if (value === null || value === undefined) return '—';
  const rounded = Number(value.toFixed(digits));
  const sign = rounded > 0 ? '+' : ''; // 0에 부호를 붙이면 어색하다
  return `${sign}${rounded.toLocaleString('ko-KR', { maximumFractionDigits: digits })}${suffix}`;
};

export const tone = (value) => {
  if (value === null || value === undefined) return '';
  if (Math.abs(value) < 1e-9) return ''; // 0은 손익 색을 입히지 않는다
  return value > 0 ? 'up' : 'down';
};

export const coinOf = (market) => market.replace('KRW-', '');

/** '2026-09-15T14:30:00' → '09-15 14:30' */
export const shortTime = (kst) => kst.slice(5, 16).replace('T', ' ');

/** 요소 하나를 속성·자식과 함께 만든다. 문자열은 textContent로 들어가 이스케이프가 보장된다. */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of [children].flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}
