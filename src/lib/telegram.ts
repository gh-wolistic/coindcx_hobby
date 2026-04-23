import TelegramBot from 'node-telegram-bot-api';
import type { RecommendRow } from './screener';
import type { EnhancedSignal } from './multiTimeframe';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  console.warn('⚠️ TELEGRAM_BOT_TOKEN not configured');
}

if (!chatId) {
  console.warn('⚠️ TELEGRAM_CHAT_ID not configured');
}

let bot: TelegramBot | null = null;

function getBot(): TelegramBot | null {
  if (!token) return null;
  if (!bot) {
    bot = new TelegramBot(token, { polling: false });
  }
  return bot;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const digits = value >= 1000 ? 2 : value >= 10 ? 3 : 4;
  return value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export async function sendTradeRecommendation(trade: RecommendRow): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !chatId) {
    console.log('Telegram not configured, skipping notification');
    return false;
  }

  const emoji = trade.tradeSide === 'long' ? '🟢' : '🔴';
  const sideText = trade.tradeSide === 'long' ? 'LONG' : 'SHORT';
  const confidenceEmoji = trade.confidence === 'HIGH' ? '⭐⭐⭐' : trade.confidence === 'MEDIUM' ? '⭐⭐' : '⭐';

  const message = `
${emoji} *${trade.symbol}* ${emoji}
━━━━━━━━━━━━━━━━━━

*Trade Signal:* ${sideText}
*Confidence:* ${trade.confidence} ${confidenceEmoji}
*Pair:* \`${trade.pair}\`

📊 *Price Levels*
━━━━━━━━━━━━━━━━━━
💰 *LTP:* ₹${formatPrice(trade.ltp)}
🎯 *Entry:* ₹${formatPrice(trade.entryPrice)}
🛑 *Stop Loss:* ₹${formatPrice(trade.stopLossPrice)}

🎯 *Targets*
━━━━━━━━━━━━━━━━━━
Target 1: ₹${formatPrice(trade.tp1Price)}
Target 2: ₹${formatPrice(trade.tp2Price)}
Target 3: ₹${formatPrice(trade.tp3Price)}

📈 *Metrics*
━━━━━━━━━━━━━━━━━━
• R:R Ratio: 1 : ${trade.rrRatio.toFixed(2)}
• RVOL20: ${trade.rvol20.toFixed(2)}x
• Signal Age: ${Math.floor(trade.minutesSinceSignal)} mins

⚠️ *Risk Management:* Always use stop loss
📱 *Timestamp:* ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
`.trim();

  try {
    await telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log(`✅ Sent Telegram notification for ${trade.symbol}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send Telegram message:', error);
    return false;
  }
}

export async function sendBulkRecommendations(trades: RecommendRow[]): Promise<void> {
  const telegramBot = getBot();
  if (!telegramBot || !chatId) {
    console.log('Telegram not configured, skipping notifications');
    return;
  }

  if (trades.length === 0) {
    await telegramBot.sendMessage(chatId, '📭 No trade recommendations at this time.', { parse_mode: 'Markdown' });
    return;
  }

  // Send summary first
  const summary = `
🔔 *Trade Recommendations Update*
━━━━━━━━━━━━━━━━━━━━━━━━
📊 Found ${trades.length} trade signal(s)
⏰ ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
`.trim();

  await telegramBot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });

  // Send each trade (with delay to avoid rate limiting)
  for (let i = 0; i < trades.length; i++) {
    await sendTradeRecommendation(trades[i]);
    // Telegram rate limit: max 30 messages per second to same chat
    if (i < trades.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
    }
  }
}

export async function sendEnhancedSignal(signal: EnhancedSignal, preset: string = 'balanced'): Promise<boolean> {
  const telegramBot = getBot();
  if (!telegramBot || !chatId) {
    console.log('Telegram not configured, skipping notification');
    return false;
  }

  const ageMin = Math.floor((Date.now() - signal.detectedAt) / 60000);
  const sideEmoji = signal.side === 'LONG' ? '🟢' : '🔴';
  const riskEmoji = signal.risk === 'LOW' ? '🟢' : signal.risk === 'MEDIUM' ? '🟡' : '🔴';
  const freshTag = signal.isFreshBurst ? '🆕 Fresh Burst' : '📈 Continuation';
  const trendEmoji = signal.trend1h === 'bullish' ? '📈' : '📉';

  const message = `
🔥 *HOTTEST TRADE ALERT* [${preset.toUpperCase()}]

${sideEmoji} *${signal.symbol}* (${signal.pair})
${signal.side} | ${riskEmoji} ${signal.risk} RISK

💰 *Price Levels*
LTP: ₹${formatPrice(signal.ltp)}
Entry: ₹${formatPrice(signal.entry)}
Stop Loss: ₹${formatPrice(signal.stopLoss)}

🎯 *Targets*
TP1: ₹${formatPrice(signal.tp1)}
TP2: ₹${formatPrice(signal.tp2)}
TP3: ₹${formatPrice(signal.tp3)}

📊 *Metrics*
• RVOL20: ${signal.rvol.toFixed(2)}x
• R:R Ratio: 1:${signal.rr.toFixed(2)}
• Impulse: ${signal.impulse > 0 ? '+' : ''}${signal.impulse.toFixed(2)}%
• ST Gap: ${signal.stGap > 0 ? '+' : ''}${signal.stGap.toFixed(2)}%
• Breakout: ${signal.breakout > 0 ? '+' : ''}${signal.breakout.toFixed(2)}%
• Status: ${signal.status}

${trendEmoji} *Multi-TF Analysis*
• 1H Trend: ${signal.trend1h.toUpperCase()}
• 15M Entry: ${signal.entry15m.toUpperCase()}
• Alignment: ✅ CONFIRMED

${freshTag} | Score: ${signal.score} | ⏱️ ${ageMin} min ago

⚠️ _Not financial advice. Always use stop loss._
`.trim();

  try {
    await telegramBot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    console.log(`✅ Sent enhanced Telegram notification for ${signal.symbol}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send Telegram message:', error);
    return false;
  }
}

export async function testTelegramConnection(): Promise<{ success: boolean; message: string }> {
  const telegramBot = getBot();
  if (!telegramBot || !chatId) {
    return { success: false, message: 'Telegram credentials not configured' };
  }

  try {
    await telegramBot.sendMessage(chatId, '✅ Telegram bot connected successfully!');
    return { success: true, message: 'Test message sent successfully' };
  } catch (error) {
    return { success: false, message: `Error: ${error}` };
  }
}
