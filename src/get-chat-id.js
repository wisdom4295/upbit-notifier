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
  console.log('받은 메시지가 없습니다. 텔레그램에서 봇에게 아무 메시지나 보낸 뒤 다시 실행하세요.');
  process.exit(0);
}

console.log('찾은 chat_id:');
for (const chat of chats.values()) {
  const name = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ');
  console.log(`  ${chat.id}  (${chat.type}${name ? `, ${name}` : ''})`);
}
