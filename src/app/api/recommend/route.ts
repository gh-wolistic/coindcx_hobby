import { NextResponse } from 'next/server';
import { calculateSupertrend, getSuperTrendStatus } from '@/lib/supertrend';
import {
  DEFAULT_EXCLUDED_PAIRS,
  normalizeExcludedPairs,
  pairToSymbol,
  type ConfidenceLevel,
  type RecommendRow,
  type RecommendResponse,
  type ScreenerRow,
  type SignalPreset,
} from '@/lib/screener';

export const dynamic = 'force-dynamic';

const BREAKOUT_WINDOW = 20;
const CONCURRENCY_LIMIT = 12;
const HOURLY_LOOKBACK = 200;
function getRecommendPresetConfig(preset: SignalPreset): { windowMs: number; minRr: number; requireNoChase: boolean; requireFresh: boolean } {
  if (preset === 'aggressive') {
    return { windowMs: 120 * 60 * 1000, minRr: 0.75, requireNoChase: false, requireFresh: false };
  }

  if (preset === 'strict') {
    return { windowMs: 45 * 60 * 1000, minRr: 1.0, requireNoChase: true, requireFresh: true };
  }

  return { windowMs: 90 * 60 * 1000, minRr: 0.85, requireNoChase: false, requireFresh: false };
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const p = parseFloat(value);
    return Number.isFinite(p) ? p : 0;
  }
  return 0;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function fetchActivePairs(): Promise<string[]> {
  const res = await fetch(
    'https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=INR',
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to fetch pairs');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchLivePrices(): Promise<Record<string, any>> {
  const res = await fetch('https://public.coindcx.com/market_data/v3/current_prices/futures/rt', { cache: 'no-store' });
  if (!res.ok) return {};
  const payload = await res.json();
  return payload?.prices ?? {};
}

async function fetchCandles(pair: string): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - HOURLY_LOOKBACK * 3600;
  const res = await fetch(
    `https://public.coindcx.com/market_data/candlesticks?pair=${encodeURIComponent(pair)}&from=${from}&to=${now}&resolution=60&pcode=f`,
    { cache: 'no-store' }
  );
  if (!res.ok) return [];
  const payload = await res.json();
  if (payload?.s !== 'ok' || !Array.isArray(payload?.data)) return [];
  return payload.data
    .map((c: any) => ({
      open: parseNumber(c.open),
      high: parseNumber(c.high),
      low: parseNumber(c.low),
      close: parseNumber(c.close),
      volume: parseNumber(c.volume),
      time: parseNumber(c.time),
    }))
    .filter((c: Candle) => c.open > 0 && c.high > 0);
}

function getAdjustedVolume(candle: Candle, isLatest: boolean): number {
  if (!isLatest) return candle.volume;
  const ts = candle.time > 1e12 ? candle.time : candle.time * 1000;
  const elapsed = Math.max(Date.now() - ts, 60000);
  const fraction = Math.min(Math.max(elapsed / 3600000, 0.2), 1);
  return candle.volume / fraction;
}

function buildRowForSide(
  pair: string,
  prices: Record<string, any>,
  candles: Candle[],
  side: 'long' | 'short'
): ScreenerRow | null {
  if (candles.length < BREAKOUT_WINDOW + 2) return null;

  const latest = candles[candles.length - 1];
  const prev = candles[candles.length - 2];
  const supertrend = calculateSupertrend(candles, 10, 3);
  if (!supertrend.current?.value) return null;

  const livePrice = prices[pair] || {};
  const ltp = parseNumber(livePrice.ls) || latest.close;
  const volume24h = parseNumber(livePrice.v);
  const stStatus = getSuperTrendStatus(ltp, supertrend.current.value, supertrend.signals);

  // burst metrics for the side
  let bestBreakout = 0;
  let bestMomentum = 0;
  let bestRvol = 0;
  let bestRange = 0;
  let isBurst = false;
  let isFresh = false;
  let bestSignalTimestamp: number | null = null;

  const candidateStart = Math.max(BREAKOUT_WINDOW, candles.length - 3);
  for (let i = candidateStart; i < candles.length; i++) {
    const candle = candles[i];
    const candlePrev = candles[i - 1];
    const window = candles.slice(i - BREAKOUT_WINDOW, i);
    if (window.length < BREAKOUT_WINDOW || !candlePrev) continue;

    const breakoutLevel = side === 'long'
      ? Math.max(...window.map((c) => c.high))
      : Math.min(...window.map((c) => c.low));
    const avgVol = window.reduce((s, c) => s + c.volume, 0) / window.length;
    const adjVol = getAdjustedVolume(candle, i === candles.length - 1);
    const refPrice = side === 'long' ? Math.max(candle.high, candle.close) : Math.min(candle.low, candle.close);
    const bo = breakoutLevel > 0
      ? side === 'long'
        ? ((refPrice - breakoutLevel) / breakoutLevel) * 100
        : ((breakoutLevel - refPrice) / breakoutLevel) * 100
      : 0;
    const mom = candlePrev.close > 0
      ? side === 'long'
        ? ((refPrice - candlePrev.close) / candlePrev.close) * 100
        : ((candlePrev.close - refPrice) / candlePrev.close) * 100
      : 0;
    const rvol = avgVol > 0 ? adjVol / avgVol : 0;
    const range = candle.open > 0 ? ((candle.high - candle.low) / candle.open) * 100 : 0;
    const burst = bo > 0.4 && mom > 1.2 && rvol >= 1.15 && range >= 1.5 &&
      (side === 'long'
        ? ltp > supertrend.current.value || supertrend.current.direction === 'uptrend'
        : ltp < supertrend.current.value || supertrend.current.direction === 'downtrend');

    let fresh = false;
    if (burst && i > BREAKOUT_WINDOW) {
      const prevWindow = candles.slice(i - BREAKOUT_WINDOW - 1, i - 1);
      if (prevWindow.length === BREAKOUT_WINDOW) {
        const prevLevel = side === 'long'
          ? Math.max(...prevWindow.map((c) => c.high))
          : Math.min(...prevWindow.map((c) => c.low));
        const prevRef = side === 'long'
          ? Math.max(candlePrev.high, candlePrev.close)
          : Math.min(candlePrev.low, candlePrev.close);
        fresh = side === 'long' ? prevRef <= prevLevel : prevRef >= prevLevel;
      }
    }

    if ((fresh && !isFresh) || (burst && !isBurst && !isFresh) || (burst === isBurst && fresh === isFresh && rvol > bestRvol)) {
      bestBreakout = bo;
      bestMomentum = mom;
      bestRvol = rvol;
      bestRange = range;
      isBurst = burst;
      isFresh = fresh;
      bestSignalTimestamp = candle.time || null;
    }
  }

  const stGapPct = supertrend.current.value > 0
    ? ((ltp - supertrend.current.value) / supertrend.current.value) * 100
    : 0;
  const impulse = prev.close > 0 ? ((ltp - prev.close) / prev.close) * 100 : 0;

  const trendLong = stStatus.type === 'above' || stStatus.type === 'crossed_above';
  const trendShort = stStatus.type === 'below' || stStatus.type === 'crossed_below';
  const noChaseLong = trendLong && stGapPct >= 0 && stGapPct <= 6 && impulse >= 1.5 && impulse <= 4.5;
  const noChaseShort = trendShort && stGapPct <= 0 && Math.abs(stGapPct) <= 6 && impulse <= -1.5 && impulse >= -4.5;
  const isExtended = Math.abs(stGapPct) > 6 || Math.abs(impulse) > 4.5 || bestRange > 6.5;
  const noChaseEligible = isBurst && !isExtended && (side === 'short' ? noChaseShort : noChaseLong) && bestRvol >= 1.2 && bestRvol <= 3.8 && bestRange <= 6.5;

  const setupType = isFresh
    ? side === 'short' ? 'fresh_breakdown' : 'fresh_breakout'
    : isExtended ? 'extended'
    : isBurst ? 'continuation'
    : 'watchlist';

  // Trade levels
  const riskPct = Math.min(Math.max(bestRange * 0.7, 1.2), 5.5) / 100;
  const entry = noChaseEligible ? ltp : (ltp + supertrend.current.value) / 2;
  let sl: number, tp1: number, tp2: number, tp3: number;

  if (side === 'long') {
    sl = Math.min(entry * (1 - riskPct), supertrend.current.value * 0.997);
    const risk = Math.max(entry - sl, entry * 0.006);
    tp1 = entry + risk;
    tp2 = entry + risk * 2;
    tp3 = entry + risk * 3;
  } else {
    sl = Math.max(entry * (1 + riskPct), supertrend.current.value * 1.003);
    const risk = Math.max(sl - entry, entry * 0.006);
    tp1 = Math.max(entry - risk, 0);
    tp2 = Math.max(entry - risk * 2, 0);
    tp3 = Math.max(entry - risk * 3, 0);
  }

  return {
    pair,
    symbol: pairToSymbol(pair),
    ltp,
    oneHourChangePct: impulse,
    volume24h,
    supertrendValue: supertrend.current.value,
    supertrendDirection: supertrend.current.direction,
    supertrendStatus: stStatus.type,
    supertrendGapPct: stGapPct,
    rvol20: bestRvol,
    breakout20Pct: side === 'long' ? bestBreakout : -bestBreakout,
    candleBodyPct: latest.open > 0 ? (Math.abs(latest.close - latest.open) / latest.open) * 100 : 0,
    rangePct: bestRange,
    burstSignal: isBurst,
    freshBurstSignal: isFresh,
    noChaseEligible,
    setupType,
    score: 0,
    entryPrice: entry,
    stopLossPrice: sl,
    tp1Price: tp1,
    tp2Price: tp2,
    tp3Price: tp3,
    tradeSide: side,
    lastSignalTimestamp: bestSignalTimestamp,
  };
}

function computeConviction(row: ScreenerRow): { convictionScore: number; confidence: ConfidenceLevel; minutesSinceSignal: number; rrRatio: number } {
  const tsMs = row.lastSignalTimestamp
    ? row.lastSignalTimestamp > 1e12 ? row.lastSignalTimestamp : row.lastSignalTimestamp * 1000
    : null;
  const minutesSinceSignal = tsMs ? Math.max(0, (Date.now() - tsMs) / 60000) : 999;

  const risk = Math.abs(row.entryPrice - row.stopLossPrice);
  const reward = Math.abs(row.tp1Price - row.entryPrice);
  const rrRatio = risk > 0 ? reward / risk : 0;

  const convictionScore =
    (row.freshBurstSignal ? 40 : 0) +
    (row.supertrendStatus === 'crossed_above' || row.supertrendStatus === 'crossed_below' ? 25 : 10) +
    (row.rvol20 - 1) * 20 +
    Math.max(Math.abs(row.breakout20Pct), 0) * 8 +
    Math.max(Math.abs(row.oneHourChangePct), 0) * 5 -
    minutesSinceSignal * 2 -
    (Math.abs(row.supertrendGapPct) > 4 ? 15 : 0) +
    (row.noChaseEligible ? 10 : 0) +
    rrRatio * 5;

  let confidence: ConfidenceLevel = 'LOW';
  if (row.freshBurstSignal && (row.supertrendStatus === 'crossed_above' || row.supertrendStatus === 'crossed_below') && row.rvol20 > 2 && minutesSinceSignal < 10) {
    confidence = 'HIGH';
  } else if (row.burstSignal && row.rvol20 > 1.5 && minutesSinceSignal < 20) {
    confidence = 'MEDIUM';
  }

  return { convictionScore, confidence, minutesSinceSignal, rrRatio };
}

export async function POST(request: Request) {
  try {
    let body: { excludedPairs?: string[]; preset?: SignalPreset } | null = null;
    try { body = await request.json(); } catch { body = null; }

    const preset: SignalPreset = body?.preset || 'balanced';
    const presetConfig = getRecommendPresetConfig(preset);
    const excludedPairs = normalizeExcludedPairs(body?.excludedPairs || DEFAULT_EXCLUDED_PAIRS);
    const excludedSet = new Set(excludedPairs);
    const [allPairs, prices] = await Promise.all([fetchActivePairs(), fetchLivePrices()]);
    const pairsToScan = allPairs.filter((p) => !excludedSet.has(p.toUpperCase()));

    const scannedRows = await mapWithConcurrency(pairsToScan, CONCURRENCY_LIMIT, async (pair) => {
      try {
        const candles = await fetchCandles(pair);
        const longRow = buildRowForSide(pair, prices, candles, 'long');
        const shortRow = buildRowForSide(pair, prices, candles, 'short');
        return [longRow, shortRow].filter((r): r is ScreenerRow => Boolean(r));
      } catch {
        return [];
      }
    });

    // Filter by burst + recency, with optional strict-mode constraints.
    const hotRows = scannedRows
      .flat()
      .filter((row): row is ScreenerRow => Boolean(row))
      .filter((row) => {
        if (!row.burstSignal) return false;
        if (presetConfig.requireNoChase && !row.noChaseEligible) return false;
        if (presetConfig.requireFresh && !row.freshBurstSignal) return false;
        if (!row.lastSignalTimestamp) return false;
        const tsMs = row.lastSignalTimestamp > 1e12 ? row.lastSignalTimestamp : row.lastSignalTimestamp * 1000;
        return Date.now() - tsMs <= presetConfig.windowMs;
      });

    // Score and sort
    const scored: RecommendRow[] = hotRows
      .map((row) => {
        const { convictionScore, confidence, minutesSinceSignal, rrRatio } = computeConviction(row);
        return { ...row, convictionScore, confidence, minutesSinceSignal, rrRatio };
      })
      .filter((r) => r.rrRatio >= presetConfig.minRr)
      .sort((a, b) => b.convictionScore - a.convictionScore);

    const response: RecommendResponse = {
      top: scored[0] || null,
      runners: scored.slice(1, 4),
      scannedPairs: pairsToScan.length,
      hotCandidates: hotRows.length,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Recommend error:', error);
    return NextResponse.json({ error: 'Failed to build recommendation' }, { status: 500 });
  }
}
