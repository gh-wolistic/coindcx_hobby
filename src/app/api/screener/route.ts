import { NextResponse } from 'next/server';
import { calculateSupertrend, getSuperTrendStatus } from '@/lib/supertrend';
import {
  DEFAULT_EXCLUDED_PAIRS,
  normalizeExcludedPairs,
  pairToSymbol,
  type ScreenerMode,
  type SetupType,
  type ScreenerResponse,
  type ScreenerRow,
} from '@/lib/screener';

export const dynamic = 'force-dynamic';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

const BREAKOUT_WINDOW = 20;
const CONCURRENCY_LIMIT = 12;
const HOURLY_LOOKBACK = 200;

const NO_CHASE_MAX_ST_GAP_PCT = 6;
const NO_CHASE_MIN_IMPULSE_PCT = 1.5;
const NO_CHASE_MAX_IMPULSE_PCT = 4.5;
const NO_CHASE_MIN_RVOL = 1.2;
const NO_CHASE_MAX_RVOL = 3.8;
const NO_CHASE_MAX_RANGE_PCT = 6.5;
const HOT_SIGNAL_WINDOW_MS = 15 * 60 * 1000;


interface BurstMetrics {
  breakout20Pct: number;
  momentumPct: number;
  rvol20: number;
  candleBodyPct: number;
  rangePct: number;
  burstSignal: boolean;
  freshBurstSignal: boolean;
  score: number;
}

type BurstDirection = 'long' | 'short';

function normalizeTimestampMs(timestamp: number | null): number | null {
  if (!timestamp) {
    return null;
  }

  return timestamp > 1000000000000 ? timestamp : timestamp * 1000;
}

function parseNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

async function fetchActivePairs(): Promise<string[]> {
  const response = await fetch(
    'https://api.coindcx.com/exchange/v1/derivatives/futures/data/active_instruments?margin_currency_short_name[]=INR',
    {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch active futures pairs');
  }

  const pairs = await response.json();
  return Array.isArray(pairs) ? pairs : [];
}

async function fetchLivePrices(): Promise<Record<string, any>> {
  const response = await fetch('https://public.coindcx.com/market_data/v3/current_prices/futures/rt', {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return {};
  }

  const payload = await response.json();
  return payload?.prices && typeof payload.prices === 'object' ? payload.prices : {};
}

async function fetchCandles(pair: string): Promise<Candle[]> {
  const now = Math.floor(Date.now() / 1000);
  const lookback = now - HOURLY_LOOKBACK * 60 * 60;
  const response = await fetch(
    `https://public.coindcx.com/market_data/candlesticks?pair=${encodeURIComponent(pair)}&from=${lookback}&to=${now}&resolution=60&pcode=f`,
    {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  if (payload?.s !== 'ok' || !Array.isArray(payload?.data)) {
    return [];
  }

  return payload.data
    .map((candle: any) => ({
      open: parseNumber(candle.open),
      high: parseNumber(candle.high),
      low: parseNumber(candle.low),
      close: parseNumber(candle.close),
      volume: parseNumber(candle.volume),
      time: parseNumber(candle.time),
    }))
    .filter((candle: Candle) => candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0);
}

function getAdjustedVolume(candle: Candle, isLatestCandle: boolean): number {
  if (!isLatestCandle) {
    return candle.volume;
  }

  const candleTime = candle.time > 1000000000000 ? candle.time : candle.time * 1000;
  const elapsed = Math.max(Date.now() - candleTime, 60000);
  const elapsedFraction = Math.min(Math.max(elapsed / (60 * 60 * 1000), 0.2), 1);
  return candle.volume / elapsedFraction;
}

function getRecentBurstMetrics(
  candles: Candle[],
  supertrendValue: number,
  currentDirection: 'uptrend' | 'downtrend',
  ltp: number,
  burstDirection: BurstDirection
): BurstMetrics {
  const candidateStart = Math.max(BREAKOUT_WINDOW, candles.length - 3);
  let bestCandidate: BurstMetrics = {
    breakout20Pct: 0,
    momentumPct: 0,
    rvol20: 0,
    candleBodyPct: 0,
    rangePct: 0,
    burstSignal: false,
    freshBurstSignal: false,
    score: 0,
  };

  for (let index = candidateStart; index < candles.length; index += 1) {
    const candle = candles[index];
    const previousCandle = candles[index - 1];
    const breakoutWindow = candles.slice(index - BREAKOUT_WINDOW, index);
    if (breakoutWindow.length < BREAKOUT_WINDOW || !previousCandle) {
      continue;
    }

    const breakoutLevel =
      burstDirection === 'long'
        ? Math.max(...breakoutWindow.map((entry) => entry.high))
        : Math.min(...breakoutWindow.map((entry) => entry.low));
    const averageVolume = breakoutWindow.reduce((sum, entry) => sum + entry.volume, 0) / breakoutWindow.length;
    const referenceMovePrice =
      burstDirection === 'long' ? Math.max(candle.high, candle.close) : Math.min(candle.low, candle.close);
    const adjustedVolume = getAdjustedVolume(candle, index === candles.length - 1);
    const breakoutStrengthPct =
      breakoutLevel > 0
        ? burstDirection === 'long'
          ? ((referenceMovePrice - breakoutLevel) / breakoutLevel) * 100
          : ((breakoutLevel - referenceMovePrice) / breakoutLevel) * 100
        : 0;
    const momentumStrengthPct =
      previousCandle.close > 0
        ? burstDirection === 'long'
          ? ((referenceMovePrice - previousCandle.close) / previousCandle.close) * 100
          : ((previousCandle.close - referenceMovePrice) / previousCandle.close) * 100
        : 0;
    const breakout20Pct = burstDirection === 'long' ? breakoutStrengthPct : -breakoutStrengthPct;
    const momentumPct = burstDirection === 'long' ? momentumStrengthPct : -momentumStrengthPct;
    const candleBodyPct = candle.open > 0 ? (Math.abs(candle.close - candle.open) / candle.open) * 100 : 0;
    const rangePct = candle.open > 0 ? ((candle.high - candle.low) / candle.open) * 100 : 0;
    const rvol20 = averageVolume > 0 ? adjustedVolume / averageVolume : 0;
    const burstSignal =
      breakoutStrengthPct > 0.4 &&
      momentumStrengthPct > 1.2 &&
      rvol20 >= 1.15 &&
      rangePct >= 1.5 &&
      (burstDirection === 'long'
        ? ltp > supertrendValue || currentDirection === 'uptrend'
        : ltp < supertrendValue || currentDirection === 'downtrend');
    let freshBurstSignal = false;
    if (burstSignal && index > BREAKOUT_WINDOW) {
      const previousBreakoutWindow = candles.slice(index - BREAKOUT_WINDOW - 1, index - 1);
      if (previousBreakoutWindow.length === BREAKOUT_WINDOW) {
        const previousBreakoutLevel =
          burstDirection === 'long'
            ? Math.max(...previousBreakoutWindow.map((entry) => entry.high))
            : Math.min(...previousBreakoutWindow.map((entry) => entry.low));
        const previousReferencePrice =
          burstDirection === 'long'
            ? Math.max(previousCandle.high, previousCandle.close)
            : Math.min(previousCandle.low, previousCandle.close);
        freshBurstSignal =
          burstDirection === 'long'
            ? previousReferencePrice <= previousBreakoutLevel
            : previousReferencePrice >= previousBreakoutLevel;
      }
    }
    const score = Number(
      (
        (freshBurstSignal ? 70 : burstSignal ? 55 : 0) +
        Math.max(breakoutStrengthPct, 0) * 16 +
        Math.max(momentumStrengthPct, 0) * 7 +
        Math.max(rvol20 - 1, 0) * 22 +
        Math.max(rangePct, 0) * 2
      ).toFixed(2)
    );

    if (freshBurstSignal && !bestCandidate.freshBurstSignal) {
      bestCandidate = {
        breakout20Pct,
        momentumPct,
        rvol20,
        candleBodyPct,
        rangePct,
        burstSignal,
        freshBurstSignal,
        score,
      };
      continue;
    }

    if (burstSignal && !bestCandidate.burstSignal && !bestCandidate.freshBurstSignal) {
      bestCandidate = {
        breakout20Pct,
        momentumPct,
        rvol20,
        candleBodyPct,
        rangePct,
        burstSignal,
        freshBurstSignal,
        score,
      };
      continue;
    }

    if (
      freshBurstSignal === bestCandidate.freshBurstSignal &&
      burstSignal === bestCandidate.burstSignal &&
      score > bestCandidate.score
    ) {
      bestCandidate = {
        breakout20Pct,
        momentumPct,
        rvol20,
        candleBodyPct,
        rangePct,
        burstSignal,
        freshBurstSignal,
        score,
      };
    }
  }

  return bestCandidate;
}

function getTradeLevels(
  ltp: number,
  supertrendValue: number,
  rangePct: number,
  supertrendDirection: 'uptrend' | 'downtrend',
  noChaseEligible: boolean,
  preferredSide?: 'long' | 'short'
): {
  tradeSide: 'long' | 'short';
  entryPrice: number;
  stopLossPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
} {
  const pullbackEntry = (ltp + supertrendValue) / 2;
  const entryPrice = noChaseEligible ? ltp : pullbackEntry;
  const riskPct = Math.min(Math.max(rangePct * 0.7, 1.2), 5.5) / 100;
  const side = preferredSide || (supertrendDirection === 'uptrend' ? 'long' : 'short');

  if (side === 'long') {
    const stopByRange = entryPrice * (1 - riskPct);
    const stopByTrend = supertrendValue * 0.997;
    const stopLossPrice = Math.min(stopByRange, stopByTrend);
    const risk = Math.max(entryPrice - stopLossPrice, entryPrice * 0.006);

    return {
      tradeSide: 'long',
      entryPrice,
      stopLossPrice,
      tp1Price: entryPrice + risk,
      tp2Price: entryPrice + risk * 2,
      tp3Price: entryPrice + risk * 3,
    };
  }

  const stopByRange = entryPrice * (1 + riskPct);
  const stopByTrend = supertrendValue * 1.003;
  const stopLossPrice = Math.max(stopByRange, stopByTrend);
  const risk = Math.max(stopLossPrice - entryPrice, entryPrice * 0.006);

  return {
    tradeSide: 'short',
    entryPrice,
    stopLossPrice,
    tp1Price: Math.max(entryPrice - risk, 0),
    tp2Price: Math.max(entryPrice - risk * 2, 0),
    tp3Price: Math.max(entryPrice - risk * 3, 0),
  };
}

function buildRow(
  pair: string,
  prices: Record<string, any>,
  candles: Candle[],
  mode: Exclude<ScreenerMode, 'hot'>
): ScreenerRow | null {
  if (candles.length < BREAKOUT_WINDOW + 2) {
    return null;
  }

  const latestCandle = candles[candles.length - 1];
  const previousCandle = candles[candles.length - 2];
  const previousWindow = candles.slice(-(BREAKOUT_WINDOW + 1), -1);
  if (previousWindow.length === 0) {
    return null;
  }

  const supertrend = calculateSupertrend(candles, 10, 3);
  if (!supertrend.current?.value) {
    return null;
  }

  const livePrice = prices[pair] || {};
  const ltp = parseNumber(livePrice.ls) || latestCandle.close;
  const volume24h = parseNumber(livePrice.v);
  const supertrendStatus = getSuperTrendStatus(ltp, supertrend.current.value, supertrend.signals);
  const burstDirection: BurstDirection = mode === 'short' ? 'short' : 'long';
  const recentBurst = getRecentBurstMetrics(candles, supertrend.current.value, supertrend.current.direction, ltp, burstDirection);
  const oneHourChangePct = previousCandle.close > 0 ? ((ltp - previousCandle.close) / previousCandle.close) * 100 : 0;
  const supertrendGapPct = supertrend.current.value > 0 ? ((ltp - supertrend.current.value) / supertrend.current.value) * 100 : 0;
  const isExtended =
    Math.abs(supertrendGapPct) > NO_CHASE_MAX_ST_GAP_PCT ||
    Math.abs(oneHourChangePct) > NO_CHASE_MAX_IMPULSE_PCT ||
    recentBurst.rangePct > NO_CHASE_MAX_RANGE_PCT;
  const trendAlignedLong = supertrendStatus.type === 'above' || supertrendStatus.type === 'crossed_above';
  const trendAlignedShort = supertrendStatus.type === 'below' || supertrendStatus.type === 'crossed_below';
  const noChaseLong =
    trendAlignedLong &&
    supertrendGapPct >= 0 &&
    supertrendGapPct <= NO_CHASE_MAX_ST_GAP_PCT &&
    oneHourChangePct >= NO_CHASE_MIN_IMPULSE_PCT &&
    oneHourChangePct <= NO_CHASE_MAX_IMPULSE_PCT;
  const noChaseShort =
    trendAlignedShort &&
    supertrendGapPct <= 0 &&
    Math.abs(supertrendGapPct) <= NO_CHASE_MAX_ST_GAP_PCT &&
    oneHourChangePct <= -NO_CHASE_MIN_IMPULSE_PCT &&
    oneHourChangePct >= -NO_CHASE_MAX_IMPULSE_PCT;
  const noChaseEligible =
    recentBurst.burstSignal &&
    !isExtended &&
    (mode === 'short' ? noChaseShort : noChaseLong) &&
    recentBurst.rvol20 >= NO_CHASE_MIN_RVOL &&
    recentBurst.rvol20 <= NO_CHASE_MAX_RVOL &&
    recentBurst.rangePct <= NO_CHASE_MAX_RANGE_PCT;
  const setupType: SetupType = recentBurst.freshBurstSignal
    ? mode === 'short'
      ? 'fresh_breakdown'
      : 'fresh_breakout'
    : isExtended
      ? 'extended'
      : recentBurst.burstSignal
        ? 'continuation'
        : 'watchlist';
  const levels = getTradeLevels(
    ltp,
    supertrend.current.value,
    recentBurst.rangePct,
    supertrend.current.direction,
    noChaseEligible,
    mode === 'short' ? 'short' : undefined
  );
  const score = Number(
    (
      recentBurst.score +
      (mode === 'short' ? Math.max(-oneHourChangePct, 0) : Math.max(oneHourChangePct, 0)) * 4 +
      (noChaseEligible ? 12 : 0) +
      (setupType === 'extended' ? -10 : 0) +
      (mode === 'short'
        ? supertrendStatus.type === 'crossed_below'
          ? 14
          : supertrendStatus.type === 'below'
            ? 6
            : 0
        : supertrendStatus.type === 'crossed_above'
          ? 14
          : supertrendStatus.type === 'above'
            ? 6
            : 0)
    ).toFixed(2)
  );

  return {
    pair,
    symbol: pairToSymbol(pair),
    ltp,
    oneHourChangePct,
    volume24h,
    supertrendValue: supertrend.current.value,
    supertrendDirection: supertrend.current.direction,
    supertrendStatus: supertrendStatus.type,
    supertrendGapPct,
    rvol20: recentBurst.rvol20,
    breakout20Pct: recentBurst.breakout20Pct,
    candleBodyPct: recentBurst.candleBodyPct,
    rangePct: recentBurst.rangePct,
    burstSignal: recentBurst.burstSignal,
    freshBurstSignal: recentBurst.freshBurstSignal,
    noChaseEligible,
    setupType,
    score,
    entryPrice: levels.entryPrice,
    stopLossPrice: levels.stopLossPrice,
    tp1Price: levels.tp1Price,
    tp2Price: levels.tp2Price,
    tp3Price: levels.tp3Price,
    tradeSide: levels.tradeSide,
    lastSignalTimestamp: supertrend.signals[0]?.timestamp || null,
  };
}

export async function POST(request: Request) {
  try {
    let requestBody: { excludedPairs?: string[]; mode?: ScreenerMode } | null = null;

    try {
      requestBody = await request.json();
    } catch {
      requestBody = null;
    }

  const mode: ScreenerMode = requestBody?.mode || 'burst';
    const excludedPairs = normalizeExcludedPairs(requestBody?.excludedPairs || DEFAULT_EXCLUDED_PAIRS);
    const excludedSet = new Set(excludedPairs);
    const [allPairs, prices] = await Promise.all([fetchActivePairs(), fetchLivePrices()]);
    const pairsToScan = allPairs.filter((pair) => !excludedSet.has(pair.toUpperCase()));

    const scannedRows = await mapWithConcurrency(pairsToScan, CONCURRENCY_LIMIT, async (pair) => {
      try {
        const candles = await fetchCandles(pair);

        if (mode === 'hot') {
          const longRow = buildRow(pair, prices, candles, 'burst');
          const shortRow = buildRow(pair, prices, candles, 'short');
          return [longRow, shortRow].filter((row): row is ScreenerRow => Boolean(row));
        }

        const row = buildRow(pair, prices, candles, mode);
        return row ? [row] : [];
      } catch (error) {
        console.error(`Failed to screen ${pair}:`, error);
        return [];
      }
    });

    const flattenedRows = scannedRows.flat();
    const rows = flattenedRows
      .filter((row): row is ScreenerRow => Boolean(row))
      .filter((row) => {
        if (mode !== 'hot') {
          return true;
        }

        if (!row.burstSignal) {
          return false;
        }

        const signalTimeMs = normalizeTimestampMs(row.lastSignalTimestamp);
        if (!signalTimeMs) {
          return false;
        }

        return Date.now() - signalTimeMs <= HOT_SIGNAL_WINDOW_MS;
      })
      .sort((a, b) => {
        if (mode === 'hot' && a.tradeSide !== b.tradeSide) {
          return a.tradeSide === 'short' ? -1 : 1;
        }

        if (mode === 'short' && a.tradeSide !== b.tradeSide) {
          return a.tradeSide === 'short' ? -1 : 1;
        }

        if (a.noChaseEligible !== b.noChaseEligible) {
          return a.noChaseEligible ? -1 : 1;
        }

        if (a.freshBurstSignal !== b.freshBurstSignal) {
          return a.freshBurstSignal ? -1 : 1;
        }

        if (a.burstSignal !== b.burstSignal) {
          return a.burstSignal ? -1 : 1;
        }

        if (b.score !== a.score) {
          return b.score - a.score;
        }

        return b.rvol20 - a.rvol20;
      });

    const response: ScreenerResponse = {
      rows,
      totalPairs: allPairs.length,
      scannedPairs: pairsToScan.length,
      excludedPairs,
      burstCount: rows.filter((row) => row.burstSignal).length,
      freshBurstCount: rows.filter((row) => row.freshBurstSignal).length,
      shortCount: rows.filter((row) => row.tradeSide === 'short' && row.burstSignal).length,
      freshShortCount: rows.filter((row) => row.tradeSide === 'short' && row.freshBurstSignal).length,
      hotCount: rows.length,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error building screener:', error);
    return NextResponse.json({ error: 'Failed to build screener' }, { status: 500 });
  }
}