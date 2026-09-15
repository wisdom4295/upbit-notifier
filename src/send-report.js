/**
 * 하루치 · 한 주치 알림 정리를 텔레그램으로 보낸다.
 *
 *   node src/send-report.js daily
 *   node src/send-report.js weekly
 */
import { loadConfig } from './config.js';
import { buildReport } from './report.js';
import { sendMessage } from './telegram.js';

const period = process.argv[2] === 'weekly' ? 'weekly' : 'daily';
const dryRun = process.argv.includes('--dry-run');

const config = await loadConfig();
const { range, signals, text } = await buildReport(period, config);

console.log(`${period} 리포트 · ${range.label} · 신호 ${signals.length}건`);

await sendMessage(text, {
  token: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  dryRun,
});
