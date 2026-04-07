import { NextResponse } from 'next/server';
import { DEFAULT_EXCLUDED_PAIRS, normalizeExcludedPairs, pairToSymbol } from '@/lib/screener';

export const dynamic = 'force-dynamic';

const CONCURRENCY_LIMIT = 12;
const HOURLY_LOOKBACK = 240;
const HULL_LENGTH = 55;

type HulkColor = 'green' | 'red';
type HulkState = 'above' | 'below' | 'crossing';
type PricePosition = 'above' | 'below';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface HulkRow {
  pair: string;
  symbol: string;
  color: HulkColor;
  state: HulkState;
  price: number;
  hullValue: number;
  pricePosition: PricePosition;
  priority: boolean;
  priorityReason: string | null;
}

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

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function fetchActivePairs(): Promise<string[]> {
  const res = await fetch(
    'https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=INR',
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to fetch active pairs');
  const data = await res.json();
  return Array.isArray(data) ? data : [];
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
    .filter((c: Candle) => c.open > 0 && c.high > 0 && c.low > 0 && c.close > 0);
}

function wma(values: number[], period: number): (number | null)[] {
  const p = Math.max(1, Math.round(period));
  const out: (number | null)[] = new Array(values.length).fill(null);
  const denom = (p * (p + 1)) / 2;

  for (let i = p - 1; i < values.length; i++) {
    let weighted = 0;
    let weight = 1;
    for (let j = i - p + 1; j <= i; j++) {
      weighted += values[j] * weight;
      weight += 1;
    }
    out[i] = weighted / denom;
  }

  return out;
}

function hma(values: number[], length: number): (number | null)[] {
  const l = Math.max(2, Math.round(length));
  const half = Math.max(1, Math.round(l / 2));
  const sqrtL = Math.max(1, Math.round(Math.sqrt(l)));

  const wHalf = wma(values, half);
  const wFull = wma(values, l);
  const diff: (number | null)[] = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (wHalf[i] == null || wFull[i] == null) continue;
    diff[i] = 2 * (wHalf[i] as number) - (wFull[i] as number);
  }

  const compact = diff.filter((v): v is number => v != null && Number.isFinite(v));
  const compactWma = wma(compact, sqrtL);

  const out: (number | null)[] = new Array(values.length).fill(null);
  const offset = values.length - compactWma.length;
  for (let i = 0; i < compactWma.length; i++) {
    out[offset + i] = compactWma[i];
  }

  return out;
}

function getHullStatus(
  candles: Candle[]
): {
  color: HulkColor;
  state: HulkState;
  price: number;
  hullValue: number;
  pricePosition: PricePosition;
  priority: boolean;
  priorityReason: string | null;
} | null {
  if (candles.length < HULL_LENGTH + 5) return null;

  const closes = candles.map((c) => c.close);
  const hull = hma(closes, HULL_LENGTH);

  const i = hull.length - 1;
  const mhullNow = hull[i];
  const shullNow = i >= 2 ? hull[i - 2] : null;
  const mhullPrev = i >= 1 ? hull[i - 1] : null;
  const shullPrev = i >= 3 ? hull[i - 3] : null;

  if (mhullNow == null || shullNow == null || mhullPrev == null || shullPrev == null) return null;

  const crossingUp = (mhullPrev as number) <= (shullPrev as number) && (mhullNow as number) > (shullNow as number);
  const crossingDown = (mhullPrev as number) >= (shullPrev as number) && (mhullNow as number) < (shullNow as number);
  const crossing = crossingUp || crossingDown;

  const color: HulkColor = (mhullNow as number) > (shullNow as number) ? 'green' : 'red';
  const state: HulkState = crossing ? 'crossing' : (mhullNow as number) > (shullNow as number) ? 'above' : 'below';
  const price = closes[closes.length - 1];
  const hullValue = mhullNow as number;
  const pricePosition: PricePosition = price >= hullValue ? 'above' : 'below';

  let priorityReason: string | null = null;
  if (crossing) {
    priorityReason = 'Hull crossing';
  } else if (color === 'green' && pricePosition === 'below') {
    priorityReason = 'Green hull, price below';
  } else if (color === 'red' && pricePosition === 'above') {
    priorityReason = 'Red hull, price above';
  }

  return {
    color,
    state,
    price,
    hullValue,
    pricePosition,
    priority: Boolean(priorityReason),
    priorityReason,
  };
}

export async function POST(request: Request) {
  try {
    let body: { excludedPairs?: string[] } | null = null;
    try {
      body = await request.json();
    } catch {
      body = null;
    }

    const excludedPairs = normalizeExcludedPairs(body?.excludedPairs || DEFAULT_EXCLUDED_PAIRS);
    const excludedSet = new Set(excludedPairs);

    const allPairs = await fetchActivePairs();
    const pairsToScan = allPairs.filter((pair) => !excludedSet.has(pair.toUpperCase()));

    const rows = (
      await mapWithConcurrency(pairsToScan, CONCURRENCY_LIMIT, async (pair) => {
        try {
          const candles = await fetchCandles(pair);
          const status = getHullStatus(candles);
          if (!status) return null;
          return {
            pair,
            symbol: pairToSymbol(pair),
            color: status.color,
            state: status.state,
            price: status.price,
            hullValue: status.hullValue,
            pricePosition: status.pricePosition,
            priority: status.priority,
            priorityReason: status.priorityReason,
          } as HulkRow;
        } catch {
          return null;
        }
      })
    ).filter((row): row is HulkRow => Boolean(row));

    return NextResponse.json({
      rows,
      scannedPairs: pairsToScan.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('HULK error:', error);
    return NextResponse.json({ error: 'Failed to build HULK status' }, { status: 500 });
  }
}
