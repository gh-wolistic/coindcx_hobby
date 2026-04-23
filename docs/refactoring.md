We will refactor our /recommended with telegram bot alerts 

alerter.js

// pseudocode - alerter.ts
const TELEGRAM_BOT_TOKEN = process.env.TG_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;

async function sendAlert(signal: Signal) {
  const msg = `🔥 *${signal.pair}* | ${signal.side}
Entry: ₹${signal.entry} | SL: ₹${signal.sl}
TP1: ₹${signal.tp1} | Score: ${signal.score}
Signal age: FRESH (just detected)`;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    body: JSON.stringify({ chat_id: CHAT_ID, text: msg, parse_mode: 'Markdown' })
  });
}

// Run every 45 seconds
setInterval(scanAndAlert, 45_000);


// Instead of only checking 1h candle:
async function getSignal(pair: string) {
  const [candles1h, candles15m] = await Promise.all([
    fetchCandles(pair, '1h', 10),
    fetchCandles(pair, '15m', 20), // ← add this
  ]);

  const trend = get1hTrend(candles1h);       // direction bias
  const entry = get15mEntry(candles15m);     // timing signal

  // Only fire when BOTH agree
  if (trend === 'bullish' && entry === 'burst') {
    return buildSignal(pair, candles15m);
  }
}


// Instead of only checking 1h candle:
async function getSignal(pair: string) {
  const [candles1h, candles15m] = await Promise.all([
    fetchCandles(pair, '1h', 10),
    fetchCandles(pair, '15m', 20), // ← add this
  ]);

  const trend = get1hTrend(candles1h);       // direction bias
  const entry = get15mEntry(candles15m);     // timing signal

  // Only fire when BOTH agree
  if (trend === 'bullish' && entry === 'burst') {
    return buildSignal(pair, candles15m);
  }
}


const MAX_SIGNAL_AGE_MS = 20 * 60 * 1000; // 20 minutes

const freshSignals = signals.filter(s =>
  Date.now() - s.detectedAt < MAX_SIGNAL_AGE_MS
);


import { io } from 'socket.io-client';

const socket = io('wss://stream.coindcx.com', { transports: ['websocket'] });

socket.emit('join', { channelName: 'B-MAV_USDT@ticker' });

socket.on('tick', (data) => {
  updateLivePrice(data.pair, data.price);
  checkSignalConditions(data); // re-evaluate in real time
});



Use below files for reference 
C:\Users\g-sup\Downloads\files

I have created .env.local with chat id and token 


I have already created a railway account

┌─────────────────────────────────────────────────────┐
│                    YOUR SETUP                        │
│                                                      │
│  ┌──────────────────────┐   ┌──────────────────────┐│
│  │   Vercel (Next.js)   │   │  Railway / Render    ││
│  │                      │   │                      ││
│  │  /recommend page     │   │  alerter.ts          ││
│  │  /fresh-burst page   │   │  (always running)    ││
│  │  /wild page          │   │                      ││
│  │                      │   │  Every 60s:          ││
│  │  You browse this     │   │  → scans CoinDCX API ││
│  │  when you want to    │   │  → scores signals    ││
│  │  see all signals     │   │  → pushes Telegram   ││
│  └──────────────────────┘   └──────────┬───────────┘│
│                                        │             │
│                               ┌────────▼───────────┐ │
│                               │   Your Telegram    │ │
│                               │   (instant alert)  │ │
│                               └────────────────────┘ │
└─────────────────────────────────────────────────────┘