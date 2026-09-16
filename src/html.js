/**
 * 텔레그램은 HTML 모드로 보내므로, 사람이 적은 말이나 업비트에서 받은 이름을
 * 그대로 끼워 넣으면 메시지 전체가 거부될 수 있다. 넣기 전에 반드시 거른다.
 */
export const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
