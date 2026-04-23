/**
 * Enhanced Multi-Timeframe Analysis for CoinDCX Recommendations
 * Uses 1h for trend bias + 15m for precise entry timing
 */

import type { RecommendRow } from './screener';

export interface MultiTimeframeCandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export interface EnhancedSignal {
  pair: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  ltp: number;
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  rvol: number;
  rr: number;
  impulse: number;
  stGap: number;
  breakout: number;
  score: number;
  isFreshBurst: boolean;
  status: 'above' | 'below';
  detectedAt: number;
  trend1h: 'bullish' | 'bearish' | 'neutral';
  entry15m: 'burst' | 'continuation' | 'none';
}

// ─── SUPERTREND CALCULATION ──────────────────────────────────────────────────

function calcATR(candles: MultiTimeframeCandle[], period = 10): number[] {
  const trs: number[] = candles.map((c, i) => {
    if (i === 0) return c.high - c.low;
    const prev = candles[i - 1];
    return Math.max(
      c.high - c.low,
      Math.abs(c.high - prev.close),
      Math.abs(c.low - prev.close)
    );
  });

  const atrs: number[] = new Array(candles.length).fill(0);
  atrs[period - 1] = trs.slice(0, period).reduce((a, b) => a + b) / period;
  for (let i = period; i < candles.length; i++) {
    atrs[i] = (atrs[i - 1] * (period - 1) + trs[i]) / period;
  }
  return atrs;
}

export function calcSupertrend(
  candles: MultiTimeframeCandle[],
  period = 10,
  multiplier = 3
): { value: number; direction: 1 | -1 }[] {
  const atrs = calcATR(candles, period);
  const result: { value: number; direction: 1 | -1 }[] = new Array(candles.length).fill({ value: 0, direction: 1 });

  let upperBand = 0, lowerBand = 0, supertrend = 0, direction: 1 | -1 = 1;

  for (let i = period; i < candles.length; i++) {
    const c = candles[i];
    const hl2 = (c.high + c.low) / 2;
    const atr = atrs[i];

    const rawUpper = hl2 + multiplier * atr;
    const rawLower = hl2 - multiplier * atr;

    const prevUpper = result[i - 1]?.value ?? rawUpper;
    const prevLower = result[i - 1]?.value ?? rawLower;
    const prevDir = result[i - 1]?.direction ?? 1;
    const prevClose = candles[i - 1].close;

    upperBand = rawUpper < prevUpper || prevClose > prevUpper ? rawUpper : prevUpper;
    lowerBand = rawLower > prevLower || prevClose < prevLower ? rawLower : prevLower;

    if (prevDir === -1) {
      direction = c.close < lowerBand ? -1 : 1;
    } else {
      direction = c.close > upperBand ? 1 : -1;
    }

    supertrend = direction === 1 ? lowerBand : upperBand;
    result[i] = { value: supertrend, direction };
  }

  return result;
}

// ─── INDICATORS ──────────────────────────────────────────────────────────────

export function calcRVOL(candles: MultiTimeframeCandle[], period = 20): number {
  if (candles.length < period + 1) return 1;
  const current = candles[candles.length - 1].volume;
  const avg = candles
    .slice(candles.length - 1 - period, candles.length - 1)
    .reduce((s, c) => s + c.volume, 0) / period;
  return avg > 0 ? current / avg : 1;
}

export function impulse(c: MultiTimeframeCandle): number {
  return ((c.close - c.open) / c.open) * 100;
}

export function stGapPct(price: number, stValue: number): number {
  return ((price - stValue) / stValue) * 100;
}

export function breakoutPct(candles: MultiTimeframeCandle[], lookback = 20): number {
  const closes = candles
    .slice(candles.length - 1 - lookback, candles.length - 1)
    .map((c) => c.close);
  const highest = Math.max(...closes);
  const current = candles[candles.length - 1].close;
  return ((current - highest) / highest) * 100;
}

export function isFreshBurst(st: { value: number; direction: 1 | -1 }[], idx: number): boolean {
  if (idx < 1) return false;
  return st[idx].direction !== st[idx - 1].direction;
}

// ─── MULTI-TIMEFRAME ANALYSIS ────────────────────────────────────────────────

export function get1hTrend(candles1h: MultiTimeframeCandle[]): 'bullish' | 'bearish' | 'neutral' {
  if (candles1h.length < 10) return 'neutral';
  
  const st = calcSupertrend(candles1h, 10, 3);
  const lastSt = st[st.length - 1];
  const lastCandle = candles1h[candles1h.length - 1];
  
  if (lastSt.direction === 1 && lastCandle.close > lastSt.value) return 'bullish';
  if (lastSt.direction === -1 && lastCandle.close < lastSt.value) return 'bearish';
  
  return 'neutral';
}

export function get15mEntry(candles15m: MultiTimeframeCandle[]): 'burst' | 'continuation' | 'none' {
  if (candles15m.length < 20) return 'none';
  
  const st = calcSupertrend(candles15m, 10, 3);
  const lastIdx = candles15m.length - 1;
  const lastSt = st[lastIdx];
  const lastCandle = candles15m[lastIdx];
  
  const rvol = calcRVOL(candles15m, 20);
  const brk = breakoutPct(candles15m, 20);
  const fresh = isFreshBurst(st, lastIdx);
  
  // Fresh burst - supertrend just crossed
  if (fresh && rvol > 1.5 && Math.abs(brk) > 0.5) return 'burst';
  
  // Continuation - aligned with supertrend, good volume
  if (lastSt.direction === 1 && lastCandle.close > lastSt.value && rvol > 1.2) return 'continuation';
  if (lastSt.direction === -1 && lastCandle.close < lastSt.value && rvol > 1.2) return 'continuation';
  
  return 'none';
}

// ─── SCORING ENGINE ──────────────────────────────────────────────────────────

export function scoreSignal(params: {
  rvol: number;
  rr: number;
  impulse: number;
  stGap: number;
  breakout: number;
  freshBurst: boolean;
  direction: 1 | -1;
  trend1h: 'bullish' | 'bearish' | 'neutral';
  entry15m: 'burst' | 'continuation' | 'none';
}): number {
  let score = 0;

  // RVOL contribution - high weight
  score += Math.min(params.rvol, 100) * 7;

  // R:R ratio
  score += Math.min(params.rr, 3) * 30;

  // ST Gap - closer to supertrend is better for entries
  const absGap = Math.abs(params.stGap);
  if (absGap < 2) score += 50;
  else if (absGap < 5) score += 30;
  else if (absGap < 10) score += 10;
  else score -= 20;

  // Breakout contribution
  if (params.direction === 1 && params.breakout > 0) score += 20;
  else if (params.direction === 1 && params.breakout > -2) score += 5;

  // Fresh burst bonus
  if (params.freshBurst) score += 50;

  // Impulse alignment
  const impulseAligned =
    (params.direction === 1 && params.impulse > 0) ||
    (params.direction === -1 && params.impulse < 0);
  if (impulseAligned) score += 20;

  // Multi-timeframe alignment bonus
  const trendAligned =
    (params.direction === 1 && params.trend1h === 'bullish') ||
    (params.direction === -1 && params.trend1h === 'bearish');
  if (trendAligned && params.entry15m === 'burst') score += 100; // MAJOR bonus
  else if (trendAligned && params.entry15m === 'continuation') score += 40;
  else if (!trendAligned) score -= 50; // penalty for counter-trend

  return Math.round(score);
}

// ─── RISK ASSESSMENT ─────────────────────────────────────────────────────────

export function riskLevel(stGap: number, rvol: number, trendAligned: boolean): 'LOW' | 'MEDIUM' | 'HIGH' {
  const absGap = Math.abs(stGap);
  
  if (trendAligned && absGap < 3 && rvol > 10) return 'LOW';
  if (trendAligned && absGap < 7 && rvol > 5) return 'MEDIUM';
  if (absGap < 5 && rvol > 3) return 'MEDIUM';
  
  return 'HIGH';
}

// ─── TP/SL CALCULATION ───────────────────────────────────────────────────────

export function calcLevels(
  entry: number,
  stValue: number,
  direction: 1 | -1
): { sl: number; tp1: number; tp2: number; tp3: number } {
  const risk = Math.abs(entry - stValue);
  
  if (direction === 1) {
    return {
      sl: stValue,
      tp1: entry + risk,
      tp2: entry + risk * 2,
      tp3: entry + risk * 3,
    };
  } else {
    return {
      sl: stValue,
      tp1: entry - risk,
      tp2: entry - risk * 2,
      tp3: entry - risk * 3,
    };
  }
}

// ─── FETCH CANDLES ───────────────────────────────────────────────────────────

export async function fetchCandlesMultiTF(
  pair: string,
  interval: '1h' | '15m',
  limit: number
): Promise<MultiTimeframeCandle[]> {
  const intervalMap = { '1h': '60', '15m': '15' };
  const resolution = intervalMap[interval];
  
  const now = Math.floor(Date.now() / 1000);
  const multiplier = interval === '1h' ? 3600 : 900;
  const from = now - limit * multiplier;
  
  const url = `https://public.coindcx.com/market_data/candlesticks?pair=${encodeURIComponent(
    pair
  )}&from=${from}&to=${now}&resolution=${resolution}&pcode=f`;
  
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return [];
  
  const payload = await res.json();
  if (payload?.s !== 'ok' || !Array.isArray(payload?.data)) return [];
  
  return payload.data
    .map((c: any) => ({
      open: parseFloat(c.open) || 0,
      high: parseFloat(c.high) || 0,
      low: parseFloat(c.low) || 0,
      close: parseFloat(c.close) || 0,
      volume: parseFloat(c.volume) || 0,
      time: c.time || 0,
    }))
    .filter((c: MultiTimeframeCandle) => c.open > 0 && c.high > 0)
    .sort((a: MultiTimeframeCandle, b: MultiTimeframeCandle) => a.time - b.time);
}

// ─── MULTI-TIMEFRAME SIGNAL DETECTION ────────────────────────────────────────

export async function analyzeMultiTimeframe(
  pair: string,
  ltp: number
): Promise<EnhancedSignal | null> {
  try {
    // Fetch both timeframes in parallel
    const [candles1h, candles15m] = await Promise.all([
      fetchCandlesMultiTF(pair, '1h', 50),
      fetchCandlesMultiTF(pair, '15m', 100),
    ]);

    if (candles1h.length < 25 || candles15m.length < 25) return null;

    // Get 1h trend bias
    const trend1h = get1hTrend(candles1h);
    if (trend1h === 'neutral') return null;

    // Get 15m entry signal
    const entry15m = get15mEntry(candles15m);
    if (entry15m === 'none') return null;

    // Only fire when BOTH agree
    const st15m = calcSupertrend(candles15m, 10, 3);
    const lastIdx = candles15m.length - 1;
    const lastSt = st15m[lastIdx];
    if (!lastSt || lastSt.value === 0) return null;

    const direction = lastSt.direction;
    const side: 'LONG' | 'SHORT' = direction === 1 ? 'LONG' : 'SHORT';

    // Verify alignment
    if (trend1h === 'bullish' && direction !== 1) return null;
    if (trend1h === 'bearish' && direction !== -1) return null;

    // Verify price position
    if (direction === 1 && ltp < lastSt.value) return null;
    if (direction === -1 && ltp > lastSt.value) return null;

    // Calculate metrics
    const lastCandle = candles15m[lastIdx];
    const rvol = calcRVOL(candles15m, 20);
    const imp = impulse(lastCandle);
    const stGap = stGapPct(ltp, lastSt.value);
    const brk = breakoutPct(candles15m, 20);
    const fresh = isFreshBurst(st15m, lastIdx);
    const levels = calcLevels(ltp, lastSt.value, direction);
    const rr = Math.abs(levels.tp1 - ltp) / Math.abs(ltp - levels.sl) || 1.0;

    const trendAligned =
      (direction === 1 && trend1h === 'bullish') ||
      (direction === -1 && trend1h === 'bearish');

    const score = scoreSignal({
      rvol,
      rr,
      impulse: imp,
      stGap,
      breakout: brk,
      freshBurst: fresh,
      direction,
      trend1h,
      entry15m,
    });

    const symbol = pair.replace('B-', '').replace('_USDT', '').replace('_', '');

    return {
      pair,
      symbol,
      side,
      risk: riskLevel(stGap, rvol, trendAligned),
      ltp,
      entry: ltp,
      stopLoss: levels.sl,
      tp1: levels.tp1,
      tp2: levels.tp2,
      tp3: levels.tp3,
      rvol,
      rr,
      impulse: imp,
      stGap,
      breakout: brk,
      score,
      isFreshBurst: fresh,
      status: direction === 1 ? 'above' : 'below',
      detectedAt: Date.now(),
      trend1h,
      entry15m,
    };
  } catch (error) {
    console.error(`Error analyzing ${pair}:`, error);
    return null;
  }
}
