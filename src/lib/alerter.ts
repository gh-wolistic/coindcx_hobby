/**
 * CoinDCX Background Alerter Service
 * Runs continuously scanning for hot signals and sends Telegram alerts
 * Uses multi-timeframe analysis for higher accuracy
 */

import {
  analyzeMultiTimeframe,
  type EnhancedSignal,
} from './multiTimeframe';
import { DEFAULT_EXCLUDED_PAIRS } from './screener';

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const SCAN_INTERVAL_MS = 45_000; // 45 seconds
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown per pair
const BATCH_SIZE = 10; // Process pairs in batches
const BATCH_DELAY_MS = 500; // Delay between batches

export type AlertPreset = 'aggressive' | 'balanced' | 'strict';

const PRESET_CONFIG = {
  aggressive: { minScore: 500, minRvol: 5, minRR: 1.0, maxSignalAge: 120 * 60 * 1000 },
  balanced: { minScore: 700, minRvol: 10, minRR: 1.2, maxSignalAge: 90 * 60 * 1000 },
  strict: { minScore: 850, minRvol: 20, minRR: 1.5, maxSignalAge: 45 * 60 * 1000 },
};

// ─── DEDUPLICATION ───────────────────────────────────────────────────────────

class SignalTracker {
  private lastAlerted = new Map<string, number>();
  private sentSignals = new Set<string>();

  isDuplicate(signal: EnhancedSignal): boolean {
    const key = `${signal.pair}-${signal.side}`;
    const last = this.lastAlerted.get(key) ?? 0;
    return Date.now() - last < COOLDOWN_MS;
  }

  markAlerted(signal: EnhancedSignal): void {
    const key = `${signal.pair}-${signal.side}`;
    this.lastAlerted.set(key, Date.now());
    this.sentSignals.add(key);
  }

  isFresh(signal: EnhancedSignal, maxAge: number): boolean {
    return Date.now() - signal.detectedAt < maxAge;
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamp] of this.lastAlerted.entries()) {
      if (now - timestamp > COOLDOWN_MS * 2) {
        this.lastAlerted.delete(key);
      }
    }
  }
}

// ─── FETCHERS ────────────────────────────────────────────────────────────────

async function fetchActivePairs(): Promise<string[]> {
  try {
    const res = await fetch(
      'https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=INR',
      { cache: 'no-store' }
    );
    if (!res.ok) throw new Error('Failed to fetch pairs');
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching active pairs:', error);
    return [];
  }
}

async function fetchLivePrices(): Promise<Record<string, any>> {
  try {
    const res = await fetch(
      'https://public.coindcx.com/market_data/v3/current_prices/futures/rt',
      { cache: 'no-store' }
    );
    if (!res.ok) return {};
    const payload = await res.json();
    return payload?.prices ?? {};
  } catch (error) {
    console.error('Error fetching live prices:', error);
    return {};
  }
}

// ─── TELEGRAM FORMATTING ─────────────────────────────────────────────────────

function formatNumber(n: number, decimals = 6): string {
  return n.toFixed(decimals);
}

export function buildAlertMessage(signal: EnhancedSignal, preset: string): string {
  const ageMin = Math.floor((Date.now() - signal.detectedAt) / 60000);
  const sideEmoji = signal.side === 'LONG' ? '🟢' : '🔴';
  const riskEmoji =
    signal.risk === 'LOW' ? '🟢' : signal.risk === 'MEDIUM' ? '🟡' : '🔴';
  const freshTag = signal.isFreshBurst ? '🆕 Fresh Burst' : '📈 Continuation';
  const trendEmoji = signal.trend1h === 'bullish' ? '📈' : '📉';

  return [
    `🔥 *HOTTEST TRADE ALERT* [${preset.toUpperCase()}]`,
    ``,
    `${sideEmoji} *${signal.symbol}* (${signal.pair})`,
    `${signal.side} | ${riskEmoji} ${signal.risk} RISK`,
    ``,
    `💰 *Price Levels*`,
    `LTP: ₹${formatNumber(signal.ltp)}`,
    `Entry: ₹${formatNumber(signal.entry)}`,
    `Stop Loss: ₹${formatNumber(signal.stopLoss)}`,
    ``,
    `🎯 *Targets*`,
    `TP1: ₹${formatNumber(signal.tp1)}`,
    `TP2: ₹${formatNumber(signal.tp2)}`,
    `TP3: ₹${formatNumber(signal.tp3)}`,
    ``,
    `📊 *Metrics*`,
    `• RVOL20: ${signal.rvol.toFixed(2)}x`,
    `• R:R Ratio: 1:${signal.rr.toFixed(2)}`,
    `• Impulse: ${signal.impulse > 0 ? '+' : ''}${signal.impulse.toFixed(2)}%`,
    `• ST Gap: ${signal.stGap > 0 ? '+' : ''}${signal.stGap.toFixed(2)}%`,
    `• Breakout: ${signal.breakout > 0 ? '+' : ''}${signal.breakout.toFixed(2)}%`,
    `• Status: ${signal.status}`,
    ``,
    `${trendEmoji} *Multi-TF Analysis*`,
    `• 1H Trend: ${signal.trend1h.toUpperCase()}`,
    `• 15M Entry: ${signal.entry15m.toUpperCase()}`,
    `• Alignment: ✅ CONFIRMED`,
    ``,
    `${freshTag} | Score: ${signal.score} | ⏱️ ${ageMin} min ago`,
    ``,
    `⚠️ _Not financial advice. Always use stop loss._`,
  ].join('\n');
}

// ─── TELEGRAM SENDER ─────────────────────────────────────────────────────────

async function sendTelegramAlert(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log('[TELEGRAM] Not configured - skipping alert');
    console.log(message);
    return false;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[TELEGRAM] Send failed:', error);
      return false;
    }

    console.log(`[TELEGRAM] ✅ Alert sent successfully`);
    return true;
  } catch (error) {
    console.error('[TELEGRAM] Error sending alert:', error);
    return false;
  }
}

// ─── MAIN SCANNER ────────────────────────────────────────────────────────────

export class CoinDCXAlerter {
  private tracker: SignalTracker;
  private preset: AlertPreset;
  private excludedPairs: string[];
  private intervalId: NodeJS.Timeout | null = null;
  private isScanning = false;

  constructor(preset: AlertPreset = 'balanced', excludedPairs: string[] = DEFAULT_EXCLUDED_PAIRS) {
    this.tracker = new SignalTracker();
    this.preset = preset;
    this.excludedPairs = excludedPairs;
  }

  async scan(): Promise<void> {
    if (this.isScanning) {
      console.log('[SCAN] Previous scan still running, skipping...');
      return;
    }

    this.isScanning = true;
    const startTime = Date.now();
    console.log(`\n[${new Date().toISOString()}] 🔍 Starting scan...`);
    console.log(`   Preset: ${this.preset.toUpperCase()}`);

    try {
      // Fetch pairs and prices
      const [allPairs, prices] = await Promise.all([
        fetchActivePairs(),
        fetchLivePrices(),
      ]);

      if (!allPairs || allPairs.length === 0) {
        console.log('[SCAN] No active pairs found');
        return;
      }

      // Filter out excluded pairs (BTC, ETH, etc.)
      const excludedSet = new Set(this.excludedPairs.map(p => p.toUpperCase()));
      const pairs = allPairs.filter(pair => !excludedSet.has(pair.toUpperCase()));

      console.log(`   Found ${allPairs.length} active pairs, scanning ${pairs.length} (excluded ${allPairs.length - pairs.length})`);

      const presetConfig = PRESET_CONFIG[this.preset];
      const signals: EnhancedSignal[] = [];

      // Process in batches to avoid rate limits
      for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
        const batch = pairs.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (pair) => {
            const priceData = prices[pair];
            const ltp = priceData?.ls ? parseFloat(priceData.ls) : 0;
            if (!ltp) return null;

            return analyzeMultiTimeframe(pair, ltp);
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            const signal = result.value;
            
            // Apply filters
            if (signal.score < presetConfig.minScore) continue;
            if (signal.rvol < presetConfig.minRvol) continue;
            if (signal.rr < presetConfig.minRR) continue;
            if (!this.tracker.isFresh(signal, presetConfig.maxSignalAge)) continue;
            
            signals.push(signal);
          }
        }

        // Small delay between batches
        if (i + BATCH_SIZE < pairs.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // Sort by score
      signals.sort((a, b) => b.score - a.score);

      if (signals.length === 0) {
        console.log('   No signals above threshold');
        return;
      }

      console.log(`   🏆 Found ${signals.length} qualifying signals:`);
      signals.slice(0, 5).forEach((s, idx) => {
        console.log(
          `      ${idx + 1}. ${s.pair} | ${s.side} | Score: ${s.score} | RVOL: ${s.rvol.toFixed(1)}x | ${s.trend1h}/${s.entry15m}`
        );
      });

      // Send alert for top signal (if not duplicate)
      const topSignal = signals[0];
      if (this.tracker.isDuplicate(topSignal)) {
        console.log(`   ⏭️  ${topSignal.pair} already alerted recently, skipping`);
      } else {
        const message = buildAlertMessage(topSignal, this.preset);
        const sent = await sendTelegramAlert(message);
        if (sent) {
          this.tracker.markAlerted(topSignal);
          console.log(`   📱 Alert sent for ${topSignal.pair}`);
        }
      }

      // Cleanup old entries
      this.tracker.cleanup();
      
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`   ✅ Scan completed in ${elapsed}s`);
    } catch (error) {
      console.error('[SCAN] Error during scan:', error);
    } finally {
      this.isScanning = false;
    }
  }

  start(): void {
    console.log('🚀 CoinDCX Alerter Service Started');
    console.log(`   Preset: ${this.preset.toUpperCase()}`);
    console.log(`   Scan Interval: ${SCAN_INTERVAL_MS / 1000}s`);
    console.log(`   Telegram: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Configured' : '⚠️  Not configured'}`);
    console.log('');

    // Run immediately, then on interval
    this.scan();
    this.intervalId = setInterval(() => this.scan(), SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Alerter service stopped');
    }
  }

  setPreset(preset: AlertPreset): void {
    this.preset = preset;
    console.log(`   Preset changed to: ${preset.toUpperCase()}`);
  }
}

// ─── EXPORT FOR STANDALONE USE ──────────────────────────────────────────────

export async function runSingleScan(preset: AlertPreset = 'balanced'): Promise<EnhancedSignal[]> {
  const alerter = new CoinDCXAlerter(preset);
  await alerter.scan();
  return [];
}
