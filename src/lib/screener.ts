export const DEFAULT_EXCLUDED_PAIRS = [
  'B-AUCTION_USDT',
  'B-BCH_USDT',
  'B-BNB_USDT',
  'B-BTC_USDT',
  'B-BZ_USDT',
  'B-ETH_USDT',
  'B-PAXG_USDT',
  'B-XAU_USDT',
  'B-XMR_USDT',
  'B-YFI_USDT',
];

export type SupertrendStatusType = 'above' | 'below' | 'crossed_above' | 'crossed_below';
export type ScreenerFilter = 'all' | 'burst' | SupertrendStatusType;
export type ScreenerMode = 'burst' | 'fresh' | 'short' | 'hot';
export type SignalPreset = 'aggressive' | 'balanced' | 'strict';
export type SetupType =
  | 'fresh_breakout'
  | 'fresh_breakdown'
  | 'continuation'
  | 'extended'
  | 'watchlist';

export interface ScreenerRow {
  pair: string;
  symbol: string;
  ltp: number;
  oneHourChangePct: number;
  volume24h: number;
  supertrendValue: number;
  supertrendDirection: 'uptrend' | 'downtrend';
  supertrendStatus: SupertrendStatusType;
  supertrendGapPct: number;
  rvol20: number;
  breakout20Pct: number;
  candleBodyPct: number;
  rangePct: number;
  burstSignal: boolean;
  freshBurstSignal: boolean;
  noChaseEligible: boolean;
  setupType: SetupType;
  score: number;
  entryPrice: number;
  stopLossPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  tradeSide: 'long' | 'short';
  lastSignalTimestamp: number | null;
}

export interface ScreenerResponse {
  rows: ScreenerRow[];
  totalPairs: number;
  scannedPairs: number;
  excludedPairs: string[];
  burstCount: number;
  freshBurstCount: number;
  shortCount: number;
  freshShortCount: number;
  hotCount: number;
  fetchedAt: string;
}

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface RecommendRow extends ScreenerRow {
  convictionScore: number;
  confidence: ConfidenceLevel;
  minutesSinceSignal: number;
  rrRatio: number;
}

export interface RecommendResponse {
  top: RecommendRow | null;
  runners: RecommendRow[];
  scannedPairs: number;
  hotCandidates: number;
  fetchedAt: string;
}

export interface WildRow {
  pair: string;
  symbol: string;
  ltp: number;
  tradeSide: 'long' | 'short';
  supertrendCross: 'crossed_above' | 'crossed_below' | null;
  bodyMultiple: number;
  currentBodyPct: number;
  previousBodyPct: number;
  currentVolume: number;
  previousVolume: number;
  volumeRatio: number;
  supertrendValue: number;
  supertrendDistancePct: number;
  signalTimestamp: number;
}

export interface WildResponse {
  rows: WildRow[];
  scannedPairs: number;
  matchedPairs: number;
  fetchedAt: string;
}

export function normalizeExcludedPairs(entries: string[]): string[] {
  const unique = new Set<string>();

  for (const entry of entries) {
    const normalized = entry.trim().toUpperCase();
    if (normalized) {
      unique.add(normalized);
    }
  }

  return Array.from(unique);
}

export function parseExcludedPairsText(text: string): string[] {
  return normalizeExcludedPairs(text.split(/\r?\n|,/));
}

export function pairToSymbol(pair: string): string {
  return pair.split('_')[0]?.replace('B-', '') || pair;
}