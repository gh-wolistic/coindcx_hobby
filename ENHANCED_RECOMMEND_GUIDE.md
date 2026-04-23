# Enhanced /recommended with Multi-Timeframe Analysis & Telegram Alerts

## 🎯 Overview

Your `/recommended` endpoint has been refactored with:

✅ **Multi-timeframe analysis** (1h trend + 15m entry timing)  
✅ **45-second scanning intervals** for fresh signals  
✅ **Real-time Telegram alerts** when hot signals appear  
✅ **Enhanced scoring** with trend alignment bonuses  
✅ **Deduplication** to avoid alert spam (1-hour cooldown)  
✅ **Multiple deployment options** (cron, standalone worker, manual)  

---

## 📁 New Files Created

### Core Library
- **`src/lib/multiTimeframe.ts`** - Multi-timeframe analysis engine
- **`src/lib/alerter.ts`** - Background alerter service with scanning logic
- **`src/lib/telegram.ts`** - Updated with enhanced signal formatting

### API Endpoints
- **`src/app/api/alerter/route.ts`** - Worker endpoint for continuous scanning
- **`src/app/api/recommend-enhanced/route.ts`** - Enhanced recommend API

### Scripts
- **`scripts/standalone-alerter.ts`** - Standalone 24/7 alerter script

### Configuration
- **`vercel.json`** - Updated with alerter cron (every 2 minutes)
- **`package.json`** - Added alerter scripts

---

## 🚀 Quick Start

### 1. Install Dependencies

```powershell
npm install dotenv ts-node
```

### 2. Update .env.local

Your `.env.local` should already have these from earlier:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here

# Optional: Cron secret for production
CRON_SECRET=your_random_secret_here

# Optional: Alerter preset (aggressive, balanced, strict)
ALERTER_PRESET=balanced
```

### 3. Test the Setup

```powershell
# Test Telegram connection
curl http://localhost:3000/api/telegram/test

# Test enhanced analysis on a single pair
curl "http://localhost:3000/api/recommend-enhanced?pair=B-BTC_USDT&ltp=50000"

# Trigger a manual scan
curl -X POST http://localhost:3000/api/alerter -H "Content-Type: application/json" -d "{\"preset\":\"balanced\"}"
```

---

## 💡 How It Works

### Multi-Timeframe Strategy

```
1H TIMEFRAME → Trend Direction Bias
   ↓
   • Bullish: Price above 1h Supertrend, uptrend
   • Bearish: Price below 1h Supertrend, downtrend
   
15M TIMEFRAME → Entry Timing Signal
   ↓
   • Burst: Fresh supertrend cross + high volume
   • Continuation: Aligned with trend + good volume

SIGNAL FIRES ONLY WHEN → Both timeframes agree!
```

### Enhanced Scoring

The new scoring system gives **major bonuses** for:
- ✅ 1h and 15m alignment: **+100 points**
- ✅ Fresh supertrend cross: **+50 points**
- ✅ RVOL > 10x: **+70+ points**
- ✅ Tight stop loss (< 3% from ST): **+50 points**

Penalties for:
- ❌ Counter-trend trades: **-50 points**
- ❌ Extended from supertrend: **-20 points**

---

## 📱 Deployment Options

### Option 1: Vercel Cron (Recommended for Production)

Already configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/alerter",
      "schedule": "*/2 * * * *"  // Every 2 minutes
    }
  ]
}
```

**Deploy to Vercel:**
```powershell
vercel --prod
```

Add environment variables in Vercel dashboard:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `CRON_SECRET`

---

### Option 2: Standalone Script (24/7 Local/VPS)

Run the alerter independently from your Next.js app:

```powershell
# Balanced preset (default)
npm run alerter

# Aggressive preset (more signals, less strict)
npm run alerter:aggressive

# Strict preset (high confidence only)
npm run alerter:strict
```

**What this does:**
- Scans every 45 seconds
- Analyzes all futures pairs
- Sends Telegram alerts for top signals
- Runs indefinitely until stopped (Ctrl+C)

**Perfect for:**
- Running on a VPS / cloud instance
- Local machine during trading hours
- Raspberry Pi 24/7 monitoring

---

### Option 3: Manual API Calls

Trigger scans on-demand via API:

```powershell
# Single pair analysis
curl "http://localhost:3000/api/recommend-enhanced?pair=B-ETH_USDT&ltp=3500&sendAlert=true"

# Bulk analysis with top signal alert
curl -X POST http://localhost:3000/api/recommend-enhanced \
  -H "Content-Type: application/json" \
  -d '{"pairs":["B-BTC_USDT","B-ETH_USDT","B-SOL_USDT"], "sendTopSignal": true}'

# Trigger full scan
curl -X POST http://localhost:3000/api/alerter \
  -H "Content-Type: application/json" \
  -d '{"preset":"balanced"}'
```

---

## 🎛️ Presets Configuration

| Preset | Min Score | Min RVOL | Min R:R | Max Signal Age | Best For |
|--------|-----------|----------|---------|----------------|----------|
| **aggressive** | 500 | 5x | 1.0 | 120 min | More alerts, catch early moves |
| **balanced** | 700 | 10x | 1.2 | 90 min | Default, good balance |
| **strict** | 850 | 20x | 1.5 | 45 min | High confidence only |

Change preset by:
- Setting `ALERTER_PRESET=strict` in `.env.local`
- Using query param: `/api/alerter?preset=aggressive`
- Running script: `npm run alerter:strict`

---

## 📊 Sample Telegram Alert

```
🔥 HOTTEST TRADE ALERT [BALANCED]

🟢 SOL (B-SOL_USDT)
LONG | 🟢 LOW RISK

💰 Price Levels
LTP: ₹12,450.00
Entry: ₹12,450.00
Stop Loss: ₹12,100.00

🎯 Targets
TP1: ₹12,800.00
TP2: ₹13,150.00
TP3: ₹13,500.00

📊 Metrics
• RVOL20: 15.23x
• R:R Ratio: 1:1.75
• Impulse: +2.45%
• ST Gap: +2.10%
• Breakout: +1.85%
• Status: above

📈 Multi-TF Analysis
• 1H Trend: BULLISH
• 15M Entry: BURST
• Alignment: ✅ CONFIRMED

🆕 Fresh Burst | Score: 891 | ⏱️ 0 min ago

⚠️ Not financial advice. Always use stop loss.
```

---

## 🔧 Advanced Configuration

### Adjust Scan Intervals

Edit `src/lib/alerter.ts`:

```typescript
const SCAN_INTERVAL_MS = 45_000; // Change to 30_000 for 30s, 60_000 for 60s
```

### Adjust Cooldown Period

```typescript
const COOLDOWN_MS = 60 * 60 * 1000; // Change to 30 * 60 * 1000 for 30min cooldown
```

### Customize Alert Format

Edit the `buildAlertMessage` function in `src/lib/alerter.ts` or `src/lib/telegram.ts`

---

## 🐛 Troubleshooting

### No alerts being sent

1. **Check Telegram config:**
   ```powershell
   curl http://localhost:3000/api/telegram/test
   ```

2. **Check if signals are being found:**
   - Look at console logs when running `npm run alerter`
   - Should see "Found X qualifying signals"

3. **Lower the preset threshold:**
   - Try `aggressive` preset for more signals
   - Check if your excluded pairs list is too restrictive

### Duplicate alerts

- Cooldown period is working correctly (1 hour by default)
- Same pair won't alert again until cooldown expires

### Rate limiting errors

- Default batch size is 10 pairs at a time
- Increase `BATCH_DELAY_MS` if hitting API limits
- Vercel cron runs every 2 minutes (not 45 seconds) to avoid limits

---

## 📈 Performance Tips

1. **For faster scans:** Reduce the number of candles fetched (currently 50 for 1h, 100 for 15m)

2. **For more accurate signals:** Increase minimum RVOL and score thresholds

3. **For production:** Use Vercel cron + standalone script combo:
   - Vercel cron: Every 2-5 minutes (within free tier limits)
   - Standalone: Run on VPS for real 45-second scanning

---

## 🎯 Next Steps

1. **Monitor alerts** for 24-48 hours to tune thresholds
2. **Track performance** - which signals work best?
3. **Add filters** - exclude specific pairs, time of day filters
4. **Create dashboard** - show recent signals, alert history
5. **Implement stop-loss tracking** - notify when price hits SL/TP
6. **Add webhook support** - integrate with TradingView, Discord, etc.

---

## 📞 Testing Checklist

- [ ] Telegram test endpoint works
- [ ] Single pair enhanced analysis works
- [ ] Manual alerter scan works
- [ ] Standalone script runs without errors
- [ ] Receiving Telegram alerts
- [ ] Vercel cron configured (if deploying)
- [ ] Cooldown working (no duplicate alerts)

---

## 🚨 Important Notes

1. **Vercel Free Tier Limits:**
   - Max 10-second serverless function execution
   - Consider using standalone script for full scans

2. **API Rate Limits:**
   - CoinDCX may throttle if too many requests
   - Current batch system should handle this

3. **Not Financial Advice:**
   - This is a signal detection tool
   - Always do your own analysis
   - Use proper risk management

---

**Happy Trading! 🚀📈**

For issues or questions, check:
- Console logs in `npm run alerter`
- `/api/alerter` endpoint response
- Telegram bot @BotFather for token issues
