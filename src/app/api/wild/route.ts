import { NextResponse } from 'next/server';
import { calculateSupertrend } from '@/lib/supertrend';
import {
  DEFAULT_EXCLUDED_PAIRS,
  normalizeExcludedPairs,
  pairToSymbol,
  type WildResponse,
  type WildRow,
} from '@/lib/screener';

export const dynamic = 'force-dynamic';

const CONCURRENCY_LIMIT = 12;
const HOURLY_LOOKBACK = 200;
const DEFAULT_SUPERTREND_NEAR_THRESHOLD_PCT = 1.0;
const MIN_SUPERTREND_NEAR_THRESHOLD_PCT = 0.1;
const MAX_SUPERTREND_NEAR_THRESHOLD_PCT = 5.0;

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface LivePrice {
  ls?: unknown;
}

type LivePriceMap = Record<string, LivePrice>;

function parseNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
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

async function fetchLivePrices(): Promise<LivePriceMap> {
  const res = await fetch('https://public.coindcx.com/market_data/v3/current_prices/futures/rt', { cache: 'no-store' });
  if (!res.ok) return {};
  const payload: unknown = await res.json();
  if (!payload || typeof payload !== 'object') return {};

  const prices = (payload as { prices?: unknown }).prices;
  if (!prices || typeof prices !== 'object') return {};
  return prices as LivePriceMap;
}

async function fetchCandles(pair: string): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - HOURLY_LOOKBACK * 3600;

  const res = await fetch(
    `https://public.coindcx.com/market_data/candlesticks?pair=${encodeURIComponent(pair)}&from=${from}&to=${now}&resolution=60&pcode=f`,
    { cache: 'no-store' }
  );

  if (!res.ok) return [];
  const payload: unknown = await res.json();
  if (!payload || typeof payload !== 'object') return [];

  const status = (payload as { s?: unknown }).s;
  const data = (payload as { data?: unknown }).data;
  if (status !== 'ok' || !Array.isArray(data)) return [];

  return data
    .map((c: unknown) => {
      const raw = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
      return {
        open: parseNumber(raw.open),
        high: parseNumber(raw.high),
        low: parseNumber(raw.low),
        close: parseNumber(raw.close),
        volume: parseNumber(raw.volume),
        time: parseNumber(raw.time),
      };
    })
    .filter((c: Candle) => c.open > 0 && c.high > 0);
}

function buildWildRow(
  pair: string,
  prices: LivePriceMap,
  candles: Candle[],
  supertrendNearThresholdPct: number
): WildRow | null {
  if (candles.length < 12) return null;

  const i = candles.length - 1;
  const current = candles[i];
  const previous = candles[i - 1];
  if (!previous) return null;

  const currentBody = Math.abs(current.close - current.open);
  const previousBody = Math.abs(previous.close - previous.open);
  if (!(previousBody > 0) || !(currentBody >= previousBody * 2)) return null;
  if (!(current.volume > previous.volume)) return null;

  const supertrend = calculateSupertrend(candles, 10, 3);
  const prevStValue = supertrend.history[i - 1]?.value ?? 0;
  const stAtSignalCandle = supertrend.history[i]?.value ?? 0;
  if (!(current.close > 0) || !(stAtSignalCandle > 0) || !(prevStValue > 0)) return null;

  const wasBelow = previous.close < prevStValue;
  const isNowAbove = current.close > stAtSignalCandle;
  const wasAbove = previous.close > prevStValue;
  const isNowBelow = current.close < stAtSignalCandle;
  const supertrendCross = wasBelow && isNowAbove
    ? 'crossed_above'
    : wasAbove && isNowBelow
      ? 'crossed_below'
      : null;

  const supertrendDistancePct = (Math.abs(current.close - stAtSignalCandle) / current.close) * 100;
  if (supertrendDistancePct > supertrendNearThresholdPct) return null;

  const livePrice = prices[pair] || {};
  const ltp = parseNumber(livePrice.ls) || current.close;
  const side: 'long' | 'short' = current.close >= current.open ? 'long' : 'short';

  // Trade levels are computed only for Wild-eligible rows to keep processing light.
  const rangePct = current.open > 0 ? ((current.high - current.low) / current.open) * 100 : 0;
  const riskPct = Math.min(Math.max(rangePct * 0.7, 1.2), 5.5) / 100;
  const entry = (ltp + stAtSignalCandle) / 2;
  let sl: number;
  let tp1: number;
  let tp2: number;
  let tp3: number;

  if (side === 'long') {
    sl = Math.min(entry * (1 - riskPct), stAtSignalCandle * 0.997);
    const risk = Math.max(entry - sl, entry * 0.006);
    tp1 = entry + risk;
    tp2 = entry + risk * 2;
    tp3 = entry + risk * 3;
  } else {
    sl = Math.max(entry * (1 + riskPct), stAtSignalCandle * 1.003);
    const risk = Math.max(sl - entry, entry * 0.006);
    tp1 = Math.max(entry - risk, 0);
    tp2 = Math.max(entry - risk * 2, 0);
    tp3 = Math.max(entry - risk * 3, 0);
  }

  return {
    pair,
    symbol: pairToSymbol(pair),
    ltp,
    tradeSide: side,
    supertrendCross,
    entryPrice: entry,
    stopLossPrice: sl,
    tp1Price: tp1,
    tp2Price: tp2,
    tp3Price: tp3,
    bodyMultiple: previousBody > 0 ? currentBody / previousBody : 0,
    currentBodyPct: current.open > 0 ? (currentBody / current.open) * 100 : 0,
    previousBodyPct: previous.open > 0 ? (previousBody / previous.open) * 100 : 0,
    currentVolume: current.volume,
    previousVolume: previous.volume,
    volumeRatio: previous.volume > 0 ? current.volume / previous.volume : 0,
    supertrendValue: stAtSignalCandle,
    supertrendDistancePct,
    signalTimestamp: current.time || Math.floor(Date.now() / 1000),
  };
}

export async function POST(request: Request) {
  try {
    let body: { excludedPairs?: string[]; supertrendNearThresholdPct?: number } | null = null;
    try { body = await request.json(); } catch { body = null; }

    const rawThreshold = parseNumber(body?.supertrendNearThresholdPct);
    const supertrendNearThresholdPct = rawThreshold > 0
      ? Math.min(Math.max(rawThreshold, MIN_SUPERTREND_NEAR_THRESHOLD_PCT), MAX_SUPERTREND_NEAR_THRESHOLD_PCT)
      : DEFAULT_SUPERTREND_NEAR_THRESHOLD_PCT;

    const excludedPairs = normalizeExcludedPairs(body?.excludedPairs || DEFAULT_EXCLUDED_PAIRS);
    const excludedSet = new Set(excludedPairs);

    const [allPairs, prices] = await Promise.all([fetchActivePairs(), fetchLivePrices()]);
    const pairsToScan = allPairs.filter((p) => !excludedSet.has(p.toUpperCase()));

    const scanned = await mapWithConcurrency(pairsToScan, CONCURRENCY_LIMIT, async (pair) => {
      try {
        const candles = await fetchCandles(pair);
        return buildWildRow(pair, prices, candles, supertrendNearThresholdPct);
      } catch {
        return null;
      }
    });

    const rows = scanned
      .filter((row): row is WildRow => Boolean(row))
      .sort((a, b) => {
        const tsA = a.signalTimestamp > 1e12 ? a.signalTimestamp : a.signalTimestamp * 1000;
        const tsB = b.signalTimestamp > 1e12 ? b.signalTimestamp : b.signalTimestamp * 1000;
        if (tsB !== tsA) return tsB - tsA;
        if (b.bodyMultiple !== a.bodyMultiple) return b.bodyMultiple - a.bodyMultiple;
        return b.volumeRatio - a.volumeRatio;
      });

    const response: WildResponse = {
      rows,
      scannedPairs: pairsToScan.length,
      matchedPairs: rows.length,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to scan wild signals',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
