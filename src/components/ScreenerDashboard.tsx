'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_EXCLUDED_PAIRS,
  parseExcludedPairsText,
  type ScreenerFilter,
  type ScreenerMode,
  type ScreenerResponse,
  type ScreenerRow,
  type SignalPreset,
  type SetupType,
} from '@/lib/screener';

const STORAGE_KEY = 'coindcx-screener-excluded-pairs';

type SortDirection = 'asc' | 'desc';
type SortKey =
  | 'pair'
  | 'ltp'
  | 'oneHourChangePct'
  | 'supertrendStatus'
  | 'supertrendGapPct'
  | 'rvol20'
  | 'breakout20Pct'
  | 'rangePct'
  | 'volume24h'
  | 'lastSignalTimestamp'
  | 'score';

interface ScreenerDashboardProps {
  mode: ScreenerMode;
}

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const digits = value >= 1000 ? 2 : value >= 10 ? 3 : 4;
  return value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatCompactNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '-';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value);
}

function formatTimestamp(timestamp: number | null): string {
  if (!timestamp) return '-';
  const date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000);
  return date.toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getStatusClasses(row: ScreenerRow): string {
  if (row.freshBurstSignal) return 'bg-cyan-500/15 text-cyan-200 border-cyan-400/50';
  if (row.burstSignal) return 'bg-emerald-500/15 text-emerald-300 border-emerald-400/50';
  if (row.supertrendStatus === 'crossed_above' || row.supertrendStatus === 'above') {
    return 'bg-sky-500/15 text-sky-200 border-sky-400/40';
  }
  return 'bg-rose-500/15 text-rose-200 border-rose-400/40';
}

function getStatusLabel(row: ScreenerRow): string {
  if (row.freshBurstSignal) return 'fresh burst';
  if (row.burstSignal) return 'burst';
  return row.supertrendStatus.replace('_', ' ');
}

function statusRank(status: ScreenerRow['supertrendStatus']): number {
  switch (status) {
    case 'crossed_above':
      return 4;
    case 'above':
      return 3;
    case 'crossed_below':
      return 2;
    case 'below':
      return 1;
  }
}

function compareRows(a: ScreenerRow, b: ScreenerRow, sortKey: SortKey, direction: SortDirection): number {
  const dir = direction === 'asc' ? 1 : -1;

  if (sortKey === 'pair') return a.pair.localeCompare(b.pair) * dir;
  if (sortKey === 'supertrendStatus') return (statusRank(a.supertrendStatus) - statusRank(b.supertrendStatus)) * dir;
  if (sortKey === 'lastSignalTimestamp') return ((a.lastSignalTimestamp || 0) - (b.lastSignalTimestamp || 0)) * dir;

  const numA = a[sortKey as keyof ScreenerRow] as number;
  const numB = b[sortKey as keyof ScreenerRow] as number;
  return (numA - numB) * dir;
}

export default function ScreenerDashboard({ mode }: ScreenerDashboardProps) {
  const [rows, setRows] = useState<ScreenerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ScreenerFilter>('all');
  const [minRvol, setMinRvol] = useState(mode === 'fresh' ? '1.1' : mode === 'short' ? '1.2' : mode === 'hot' ? '1.0' : '1.0');
  const [exclusionText, setExclusionText] = useState(DEFAULT_EXCLUDED_PAIRS.join('\n'));
  const [summary, setSummary] = useState<Omit<ScreenerResponse, 'rows'> | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [appliedExclusionSignature, setAppliedExclusionSignature] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('lastSignalTimestamp');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [noChaseMode, setNoChaseMode] = useState(mode === 'hot' ? false : true);
  const [showExclusionList, setShowExclusionList] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [signalPreset, setSignalPreset] = useState<SignalPreset>('balanced');
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenSignalKeysRef = useRef<Set<string>>(new Set());
  const hasInitializedSignalsRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      setExclusionText(saved);
    }
    setHydrated(true);
  }, []);

  const playNewEntryChime = () => {
    if (!soundAlertsEnabled) return;

    const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextCtor();
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174, now + 0.08);
    gain2.gain.setValueAtTime(0.0001, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.08, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.24);
  };

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, exclusionText);
  }, [exclusionText, hydrated]);

  const fetchScreener = async () => {
    const excludedPairs = parseExcludedPairsText(exclusionText);
    setRefreshing(true);
    setError(null);
    if (rows.length === 0) setLoading(true);

    try {
      const response = await fetch('/api/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedPairs, mode, preset: signalPreset }),
      });

      if (!response.ok) throw new Error('Failed to fetch screener');

      const result: ScreenerResponse = await response.json();
      setRows(result.rows);
      setSummary({
        totalPairs: result.totalPairs,
        scannedPairs: result.scannedPairs,
        excludedPairs: result.excludedPairs,
        burstCount: result.burstCount,
        freshBurstCount: result.freshBurstCount,
        shortCount: result.shortCount,
        freshShortCount: result.freshShortCount,
        hotCount: result.hotCount,
        fetchedAt: result.fetchedAt,
      });
      setAppliedExclusionSignature(excludedPairs.join('|'));

      // Auto-add low-volume pairs to exclusion (once per day)
      const lastAutoExcludeDate = window.localStorage.getItem('coindcx-last-auto-exclude');
      const today = new Date().toISOString().split('T')[0];
      if (lastAutoExcludeDate !== today && result.rows.length > 0) {
        const lowVolPairs = result.rows
          .filter((r) => r.volume24h < 500000)
          .map((r) => r.pair)
          .filter((p) => !excludedPairs.includes(p.toUpperCase()));
        if (lowVolPairs.length > 0) {
          const updated = [...new Set([...excludedPairs, ...lowVolPairs])].sort().join('\n');
          setExclusionText(updated);
          window.localStorage.setItem('coindcx-last-auto-exclude', today);
        }
      }
    } catch (fetchError) {
      console.error(fetchError);
      setError('Failed to load the screener.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Set up hourly auto-refresh from 23:00 onwards
  useEffect(() => {
    if (!hydrated) return;

    const setupAutoRefresh = () => {
      if (autoRefreshInterval) clearInterval(autoRefreshInterval);

      const scheduleNextRefresh = () => {
        const now = new Date();
        const nextRefreshTime = new Date();
        nextRefreshTime.setHours(23, 0, 0, 0);

        // If 23:00 has already passed today, schedule for tomorrow's 23:00
        if (now > nextRefreshTime) {
          nextRefreshTime.setDate(nextRefreshTime.getDate() + 1);
        }

        const msUntilNextRefresh = nextRefreshTime.getTime() - now.getTime();
        const timeoutId = setTimeout(() => {
          fetchScreener();
          // After first refresh at 23:00, set up hourly interval
          const intervalId = setInterval(fetchScreener, 60 * 60 * 1000);
          setAutoRefreshInterval(intervalId);
        }, msUntilNextRefresh);

        return timeoutId;
      };

      const id = scheduleNextRefresh();
      setAutoRefreshInterval(id as unknown as NodeJS.Timeout);
    };

    fetchScreener();
    setupAutoRefresh();

    return () => {
      if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    };
  }, [hydrated, signalPreset]);

  useEffect(() => {
    if (mode !== 'hot') return;

    const currentSignalKeys = new Set(
      rows
        .filter((row) => row.burstSignal && Boolean(row.lastSignalTimestamp))
        .map((row) => `${row.pair}:${row.tradeSide}:${row.lastSignalTimestamp || 0}`)
    );

    if (!hasInitializedSignalsRef.current) {
      seenSignalKeysRef.current = currentSignalKeys;
      hasInitializedSignalsRef.current = true;
      return;
    }

    const hasNewSignal = Array.from(currentSignalKeys).some((key) => !seenSignalKeysRef.current.has(key));
    if (hasNewSignal) {
      playNewEntryChime();
    }

    seenSignalKeysRef.current = currentSignalKeys;
  }, [rows, mode, soundAlertsEnabled]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const currentExcludedPairs = parseExcludedPairsText(exclusionText);
  const minRvolValue = Number.parseFloat(minRvol) || 0;
  const exclusionDirty = currentExcludedPairs.join('|') !== appliedExclusionSignature;

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const matchesSearch =
        row.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        row.pair.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (mode === 'fresh' && !row.freshBurstSignal) return false;
      if (mode === 'short' && row.tradeSide !== 'short') return false;
      if (mode === 'hot') {
        if (!row.burstSignal) return false;
        if (!row.lastSignalTimestamp) return false;
        const signalTimestamp = row.lastSignalTimestamp > 1000000000000 ? row.lastSignalTimestamp : row.lastSignalTimestamp * 1000;
        if (Date.now() - signalTimestamp > 30 * 60 * 1000) return false;
      }
      if (mode === 'burst' && statusFilter === 'burst' && !row.burstSignal) return false;
      if (mode === 'short' && !row.burstSignal) return false;
      if (statusFilter !== 'all' && statusFilter !== 'burst' && row.supertrendStatus !== statusFilter) return false;
      if (row.rvol20 < minRvolValue) return false;
      if (noChaseMode && !row.noChaseEligible) return false;
      return true;
    });
  }, [rows, searchQuery, mode, statusFilter, minRvolValue, noChaseMode]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => compareRows(a, b, sortKey, sortDirection));
  }, [filteredRows, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('desc');
  };

  const candidateCount = mode === 'fresh' ? summary?.freshBurstCount ?? 0 : summary?.burstCount ?? 0;
  const displayedCandidateCount =
    mode === 'fresh'
      ? summary?.freshBurstCount ?? 0
      : mode === 'short'
        ? summary?.shortCount ?? 0
        : mode === 'hot'
          ? summary?.hotCount ?? 0
        : summary?.burstCount ?? 0;

  const setupLabelMap: Record<SetupType, string> = {
    fresh_breakout: 'Fresh Breakout',
    fresh_breakdown: 'Fresh Breakdown',
    continuation: 'Continuation',
    extended: 'Extended',
    watchlist: 'Watchlist',
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.18),transparent_35%),linear-gradient(180deg,#09090b_0%,#111827_45%,#020617_100%)] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl shadow-emerald-950/20 backdrop-blur">
          <div className="flex flex-col gap-6 border-b border-white/10 px-5 py-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap gap-2">
                <Link href="/burst" className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${mode === 'burst' ? 'border-emerald-300/40 bg-emerald-300/20 text-emerald-100' : 'border-white/20 text-zinc-300 hover:border-zinc-300'}`}>
                  Burst
                </Link>
                <Link href="/fresh-burst" className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${mode === 'fresh' ? 'border-cyan-300/45 bg-cyan-300/20 text-cyan-100' : 'border-white/20 text-zinc-300 hover:border-zinc-300'}`}>
                  Fresh Burst
                </Link>
                <Link href="/short" className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${mode === 'short' ? 'border-rose-300/45 bg-rose-300/20 text-rose-100' : 'border-white/20 text-zinc-300 hover:border-zinc-300'}`}>
                  Short
                </Link>
                <Link href="/recommend" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                  🔥 Recommend
                </Link>
                <Link href="/hulk" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                  HULK
                </Link>
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {mode === 'fresh' ? 'Fresh Burst Screener' : mode === 'short' ? 'Short Breakdown Screener' : mode === 'hot' ? 'HOT Screener' : 'Burst Screener'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base">
                {mode === 'fresh'
                  ? 'First breakout candle detection with adjusted RVOL and supertrend alignment. This page focuses only on newly triggered burst setups.'
                  : mode === 'short'
                    ? 'Find overbought unwind and profit-booking breakdowns using mirrored short burst logic with no-chase controls.'
                    : mode === 'hot'
                      ? 'Shows both long and short burst setups where the latest signal happened in the last 30 minutes.'
                    : 'Find 1h expansion moves with supertrend + breakout + RVOL, then sort by the metric that matters to your current session.'}
              </p>
            </div>

            <div className="grid min-w-full grid-cols-2 gap-3 sm:min-w-105">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Scanned</p>
                <p className="mt-2 text-2xl font-semibold text-white">{summary?.scannedPairs ?? '-'}</p>
                <p className="mt-1 text-xs text-zinc-400">from {summary?.totalPairs ?? '-'} active futures</p>
              </div>
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-100/80">{mode === 'fresh' ? 'Fresh Bursts' : mode === 'short' ? 'Short Candidates' : mode === 'hot' ? 'HOT Signals' : 'Burst Candidates'}</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-100">{displayedCandidateCount}</p>
                <p className="mt-1 text-xs text-cyan-100/70">sorted table below is fully interactive</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Excluded</p>
                <p className="mt-2 text-2xl font-semibold text-white">{summary?.excludedPairs.length ?? currentExcludedPairs.length}</p>
                <p className="mt-1 text-xs text-zinc-400">applied before candle scans</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-400">Last Refresh</p>
                <p className="mt-2 text-lg font-semibold text-white">{summary ? formatTimestamp(Date.parse(summary.fetchedAt)) : '-'}</p>
                <p className="mt-1 text-xs text-zinc-400">use refresh to apply exclusion edits</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-6 lg:grid-cols-[1.4fr_0.8fr] lg:px-8">
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr_0.6fr_auto]">
                <input
                  type="text"
                  placeholder="Search pair or symbol"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-emerald-400/60 focus:bg-black/40"
                />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as ScreenerFilter)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-emerald-400/60"
                >
                  {mode === 'burst' && <option value="burst">Burst only</option>}
                  {mode === 'short' && <option value="burst">Short burst only</option>}
                  {mode === 'hot' && <option value="burst">HOT only</option>}
                  <option value="all">All statuses</option>
                  <option value="crossed_above">Crossed above</option>
                  <option value="above">Above supertrend</option>
                  <option value="below">Below supertrend</option>
                  <option value="crossed_below">Crossed below</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={minRvol}
                  onChange={(event) => setMinRvol(event.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition focus:border-emerald-400/60"
                  placeholder="Min RVOL"
                />
                <button
                  onClick={fetchScreener}
                  disabled={refreshing}
                  className="inline-flex h-12 items-center justify-center rounded-2xl bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-emerald-200"
                >
                  {refreshing ? 'Refreshing...' : exclusionDirty ? 'Apply & Refresh' : 'Refresh'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">Showing {sortedRows.length} rows</span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-cyan-100">Click table headers to sort</span>
                <button
                  onClick={() => setNoChaseMode((prev) => !prev)}
                  className={`rounded-full border px-3 py-1 ${
                    noChaseMode
                      ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100'
                      : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300'
                  }`}
                >
                  No-Chase Mode: {noChaseMode ? 'On' : 'Off'}
                </button>
                {mode === 'short' && (
                  <span className="rounded-full border border-rose-300/30 bg-rose-300/10 px-3 py-1 text-rose-100">
                    Short mode hides long setups automatically
                  </span>
                )}
                {mode === 'hot' && (
                  <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-amber-100">
                    HOT mode freshness window is preset-driven
                  </span>
                )}
                {mode === 'hot' && (
                  <select
                    value={signalPreset}
                    onChange={(event) => setSignalPreset(event.target.value as SignalPreset)}
                    className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 outline-none"
                  >
                    <option value="aggressive">Preset: Aggressive</option>
                    <option value="balanced">Preset: Balanced</option>
                    <option value="strict">Preset: Strict</option>
                  </select>
                )}
                {mode === 'hot' && (
                  <button
                    onClick={() => setSoundAlertsEnabled((prev) => !prev)}
                    className={`rounded-full border px-3 py-1 ${
                      soundAlertsEnabled
                        ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100'
                        : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300'
                    }`}
                  >
                    New Entry Chime: {soundAlertsEnabled ? 'On' : 'Off'}
                  </button>
                )}
                {exclusionDirty && (
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-amber-200">exclusion list changed, apply to rescan</span>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Exclusion List</p>
                  <p className="text-xs text-zinc-400">Auto-updated daily with low-volume pairs (&lt;500K).</p>
                </div>
                <button
                  onClick={() => setShowExclusionList((prev) => !prev)}
                  className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium text-zinc-300 hover:border-white/40 hover:text-white transition"
                >
                  {showExclusionList ? 'Hide' : 'View'} ({currentExcludedPairs.length})
                </button>
              </div>
              {showExclusionList && (
                <textarea
                  value={exclusionText}
                  onChange={(event) => setExclusionText(event.target.value)}
                  spellCheck={false}
                  className="min-h-56 w-full rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3 font-mono text-sm leading-6 text-zinc-200 outline-none transition focus:border-emerald-400/60"
                />
              )}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-black/25 shadow-xl shadow-black/20 backdrop-blur">
          {loading ? (
            <div className="flex min-h-80 items-center justify-center px-6 py-16 text-center">
              <div>
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-300/25 border-t-emerald-300"></div>
                <p className="mt-4 text-sm font-medium text-zinc-300">Scanning futures contracts...</p>
              </div>
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center">
              <p className="text-base font-semibold text-rose-300">{error}</p>
              <button onClick={fetchScreener} className="mt-4 inline-flex rounded-full bg-rose-400 px-5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-rose-300">Retry scan</button>
            </div>
          ) : sortedRows.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-base font-semibold text-zinc-200">No contracts match the current filters.</p>
              <p className="mt-2 text-sm text-zinc-400">Try lowering RVOL or switching status filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-auto border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-[0.2em] text-zinc-400">
                    {[
                      { label: 'Pair', key: 'pair' as SortKey },
                      { label: 'Last', key: 'ltp' as SortKey },
                      { label: 'Impulse', key: 'oneHourChangePct' as SortKey },
                      { label: 'Status', key: 'supertrendStatus' as SortKey },
                      { label: 'ST Gap', key: 'supertrendGapPct' as SortKey },
                      { label: 'RVOL20', key: 'rvol20' as SortKey },
                      { label: 'Breakout 20H', key: 'breakout20Pct' as SortKey },
                      { label: 'Range', key: 'rangePct' as SortKey },
                      { label: '24H Vol', key: 'volume24h' as SortKey },
                      { label: 'Last Signal', key: 'lastSignalTimestamp' as SortKey },
                    ].map((header) => (
                      <th key={header.label} className="px-4 py-4 font-medium">
                        <button onClick={() => toggleSort(header.key)} className="inline-flex items-center gap-1 text-left">
                          <span>{header.label}</span>
                          <span className="text-[10px] text-zinc-500">{sortKey === header.key ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}</span>
                        </button>
                      </th>
                    ))}
                    <th className="px-4 py-4 font-medium">Side</th>
                    <th className="px-4 py-4 font-medium">Setup</th>
                    <th className="px-4 py-4 font-medium">Entry</th>
                    <th className="px-4 py-4 font-medium">SL</th>
                    <th className="px-4 py-4 font-medium">TP1</th>
                    <th className="px-4 py-4 font-medium">TP2</th>
                    <th className="px-4 py-4 font-medium">TP3</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row) => (
                    <tr key={row.pair} className={`border-b border-white/6 transition hover:bg-white/3 ${row.freshBurstSignal ? 'bg-cyan-400/5' : row.burstSignal ? 'bg-emerald-400/5' : ''}`}>
                      <td className="px-4 py-4 align-middle">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{row.symbol}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${getStatusClasses(row)}`}>
                              {getStatusLabel(row)}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-zinc-500">{row.pair}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 font-medium text-white">₹{formatPrice(row.ltp)}</td>
                      <td className={`px-4 py-4 font-semibold ${row.oneHourChangePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(row.oneHourChangePct)}</td>
                      <td className="px-4 py-4 text-zinc-200">{row.supertrendStatus.replace('_', ' ')}</td>
                      <td className={`px-4 py-4 font-medium ${row.supertrendGapPct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatPercent(row.supertrendGapPct)}</td>
                      <td className="px-4 py-4 font-semibold text-white">{row.rvol20.toFixed(2)}x</td>
                      <td className={`px-4 py-4 font-medium ${row.breakout20Pct >= 0 ? 'text-emerald-300' : 'text-zinc-400'}`}>{formatPercent(row.breakout20Pct)}</td>
                      <td className="px-4 py-4 text-zinc-200">{formatPercent(row.rangePct)}</td>
                      <td className="px-4 py-4 text-zinc-200">{formatCompactNumber(row.volume24h)}</td>
                      <td className="px-4 py-4 text-zinc-400">{formatTimestamp(row.lastSignalTimestamp)}</td>
                      <td className={`px-4 py-4 font-semibold uppercase ${row.tradeSide === 'long' ? 'text-emerald-300' : 'text-rose-300'}`}>{row.tradeSide}</td>
                      <td className="px-4 py-4 text-zinc-200">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs ${
                            row.setupType === 'extended'
                              ? 'border-amber-300/40 bg-amber-300/10 text-amber-100'
                              : row.noChaseEligible
                                ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-100'
                                : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300'
                          }`}
                        >
                          {setupLabelMap[row.setupType]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-zinc-200">₹{formatPrice(row.entryPrice)}</td>
                      <td className="px-4 py-4 text-zinc-200">₹{formatPrice(row.stopLossPrice)}</td>
                      <td className="px-4 py-4 text-zinc-200">₹{formatPrice(row.tp1Price)}</td>
                      <td className="px-4 py-4 text-zinc-200">₹{formatPrice(row.tp2Price)}</td>
                      <td className="px-4 py-4 text-zinc-200">₹{formatPrice(row.tp3Price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}