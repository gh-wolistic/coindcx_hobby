# Telegram Setup Guide for /recommended

## Overview
This guide will help you set up Telegram notifications to send cryptocurrency trade recommendations from your screener automatically.

---

## Step 1: Create a Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a conversation** with BotFather by clicking "Start"
3. **Create a new bot** by sending the command:
   ```
   /newbot
   ```
4. **Choose a name** for your bot (e.g., "CoinDCX Trade Alerts")
5. **Choose a username** for your bot (must end in 'bot', e.g., "coindcx_trades_bot")
6. **Save the bot token** - BotFather will provide you with an HTTP API token like:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```
   ⚠️ **Keep this token secret!**

---

## Step 2: Get Your Chat ID

### Option A: For Personal Notifications
1. **Start a chat** with your newly created bot in Telegram
2. **Send any message** to the bot (e.g., "Hello")
3. **Get your Chat ID** by visiting this URL in your browser (replace `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. **Look for** `"chat":{"id":123456789}` in the response
5. **Save your Chat ID** (the number after `"id":`)

### Option B: For Channel Notifications
1. **Create a channel** in Telegram
2. **Add your bot** as an administrator to the channel
3. **Get the Channel ID** using the same `getUpdates` method above
   - Channel IDs typically start with `-100` (e.g., `-1001234567890`)

---

## Step 3: Install Required Packages

Open your terminal in the project directory and run:

```bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
```

---

## Step 4: Configure Environment Variables

1. **Create/Update** `.env.local` file in your project root:
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token_here
   TELEGRAM_CHAT_ID=your_chat_id_here
   
   # Optional: For different environments
   # TELEGRAM_CHANNEL_ID=-1001234567890
   ```

2. **Add to** `.gitignore` (if not already there):
   ```
   .env.local
   .env*.local
   ```

---

## Step 5: Create Telegram Service

Create a new file: `src/lib/telegram.ts`

```typescript
import TelegramBot from 'node-telegram-bot-api';
import type { RecommendRow } from './screener';

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
```

---

## Step 6: Create Telegram Notification API Endpoint

Create a new file: `src/app/api/telegram/notify/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { sendBulkRecommendations, sendTradeRecommendation } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.trade) {
      // Send single trade
      const success = await sendTradeRecommendation(body.trade);
      return NextResponse.json({ success, message: success ? 'Notification sent' : 'Failed to send' });
    }

    if (body.trades && Array.isArray(body.trades)) {
      // Send multiple trades
      await sendBulkRecommendations(body.trades);
      return NextResponse.json({ success: true, message: `Sent ${body.trades.length} notifications` });
    }

    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('Telegram notify error:', error);
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}
```

---

## Step 7: Create Test Endpoint

Create a new file: `src/app/api/telegram/test/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { testTelegramConnection } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await testTelegramConnection();
  return NextResponse.json(result);
}
```

---

## Step 8: Test Your Setup

1. **Restart your dev server:**
   ```bash
   npm run dev
   ```

2. **Test the connection:**
   - Open your browser and go to: `http://localhost:3000/api/telegram/test`
   - You should receive a test message in Telegram
   - The response should show `{"success":true,"message":"Test message sent successfully"}`

3. **Verify bot configuration:**
   - Check that you received the message
   - If not, double-check your `.env.local` file

---

## Step 9: Add Manual Send Button to UI (Optional)

Update `src/app/recommend/page.tsx` to add a "Send to Telegram" button:

```typescript
// Add this function inside your component
const handleSendToTelegram = async () => {
  try {
    const response = await fetch('/api/telegram/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trades: rows }),
    });
    const result = await response.json();
    alert(result.success ? 'Sent to Telegram!' : 'Failed to send');
  } catch (error) {
    alert('Error sending to Telegram');
  }
};

// Add this button in your JSX
<button
  onClick={handleSendToTelegram}
  className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
>
  📱 Send to Telegram
</button>
```

---

## Step 10: Set Up Automated Notifications (Advanced)

### Option A: Using Vercel Cron Jobs (Recommended for production)

1. **Create** `src/app/api/cron/recommend-alerts/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { sendBulkRecommendations } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Fetch recommendations (reuse logic from /api/recommend)
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/recommend?preset=balanced`, {
      cache: 'no-store'
    });
    
    const data = await response.json();
    const recommendations = data.rows || [];

    // Send to Telegram
    await sendBulkRecommendations(recommendations);

    return NextResponse.json({ 
      success: true, 
      count: recommendations.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
```

2. **Create** `vercel.json` in project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/recommend-alerts",
      "schedule": "0 9,15 * * *"
    }
  ]
}
```

This will send alerts at 9 AM and 3 PM IST daily. Adjust the cron schedule as needed:
- `"0 * * * *"` = Every hour
- `"*/30 * * * *"` = Every 30 minutes
- `"0 9,12,15,18 * * *"` = 9 AM, 12 PM, 3 PM, 6 PM

3. **Add to** `.env.local`:
```env
CRON_SECRET=your_random_secret_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Option B: Using Local Scheduler (Development)

Use a service like PM2 or node-cron for local scheduling.

---

## Step 11: Customize Message Templates

Edit the `formatTradeRecommendation` function in `src/lib/telegram.ts` to customize:
- Emoji and formatting
- Which metrics to include/exclude
- Message layout
- Language and terminology

---

## Troubleshooting

### Issue: Bot not responding
- **Solution:** Verify bot token in `.env.local`
- Check that you've started a conversation with your bot

### Issue: Can't get Chat ID
- **Solution:** Make sure you've sent at least one message to the bot
- Use this URL format exactly: `https://api.telegram.org/bot<TOKEN>/getUpdates`

### Issue: Rate limiting errors
- **Solution:** Telegram limits messages to 30 per second
- The code includes a 1-second delay between messages

### Issue: Markdown parsing errors
- **Solution:** Some special characters need escaping in Telegram Markdown
- Use \` for backticks, \* for asterisks if they appear in dynamic text

---

## Security Best Practices

1. ✅ **Never commit** `.env.local` to git
2. ✅ **Use environment variables** for all secrets
3. ✅ **Add rate limiting** to prevent abuse of your endpoints
4. ✅ **Verify cron secret** in production cron jobs
5. ✅ **Use HTTPS** in production
6. ✅ **Implement authentication** if exposing manual trigger endpoints

---

## Next Steps

1. **Monitor notifications** for the first few days
2. **Adjust timing** based on market activity
3. **Add filters** to reduce noise (e.g., only HIGH confidence trades)
4. **Create separate channels** for different signal types
5. **Add user preferences** for customizable alerts
6. **Implement reply commands** for interactive bot features

---

## Advanced Features (Future Enhancements)

- **Interactive buttons:** Use Telegram inline keyboards for quick actions
- **User subscriptions:** Allow multiple users to subscribe/unsubscribe
- **Custom filters:** Let users choose their preferred pairs, confidence levels
- **Performance tracking:** Send daily/weekly summary of signal performance
- **Price alerts:** Real-time alerts when targets are hit
- **Two-way commands:** Reply to bot with commands like `/status`, `/stats`

---

## Support

For issues or questions:
1. Check the [Telegram Bot API docs](https://core.telegram.org/bots/api)
2. Review the [node-telegram-bot-api docs](https://github.com/yagop/node-telegram-bot-api)
3. Test with the `/api/telegram/test` endpoint first

---

**Happy Trading! 📈💰**
