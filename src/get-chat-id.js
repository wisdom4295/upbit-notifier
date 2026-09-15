/**
 * 텔레그램 chat_id 확인용 1회성 스크립트.
 * 봇에게 아무 메시지나 보낸 뒤 실행하면 chat_id가 출력된다.
 *
 *   TELEGRAM_BOT_TOKEN=... npm run chat-id
 */
const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN 환경변수가 필요합니다.');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
const body = await response.json();

if (!body.ok) {
  console.error('텔레그램 응답 오류:', body);
  process.exit(1);
}

const chats = new Map();
for (const update of body.result) {
  const chat = update.message?.chat ?? update.channel_post?.chat;
  if (chat) chats.set(chat.id, chat);
}

if (chats.size === 0) {
  console.log('받은 메시지가 없습니다.');
  console.log('  · 개인 알림: 봇과의 대화방에서 아무 메시지나 보내세요.');
  console.log('  · 단체 알림: 그룹에 봇을 넣고 그룹에서 /start@봇아이디 를 보내세요.');
  console.log('    (봇은 그룹의 일반 대화는 못 보고 / 로 시작하는 명령만 받습니다.)');
  process.exit(0);
}

console.log('찾은 chat_id:');
for (const chat of chats.values()) {
  const name = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  const kind = chat.type === 'private' ? '개인' : '단체방';
  console.log(`  ${chat.id}\t${kind}${name ? ` · ${name}` : ''}`);
}
console.log('\n이 숫자를 TELEGRAM_CHAT_ID 시크릿에 넣으세요. 단체방은 앞의 - 까지 전부 포함합니다.');
