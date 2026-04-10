'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useRef } from 'react';
import { parseExcludedPairsText, DEFAULT_EXCLUDED_PAIRS, type RecommendRow, type RecommendResponse, type SignalPreset } from '@/lib/screener';

const STORAGE_KEY = 'coindcx-screener-excluded-pairs';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const digits = value >= 1000 ? 2 : value >= 10 ? 3 : 4;
  return value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatMins(mins: number): string {
  if (mins < 1) return '< 1 min ago';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  return `${(mins / 60).toFixed(1)}h ago`;
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    HIGH: 'border-emerald-300/60 bg-emerald-300/20 text-emerald-100',
    MEDIUM: 'border-amber-300/60 bg-amber-300/20 text-amber-100',
    LOW: 'border-zinc-400/40 bg-zinc-400/10 text-zinc-300',
  };
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${map[level] ?? map.LOW}`}>
      {level}
    </span>
  );
}

function SideBadge({ side }: { side: string }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${side === 'long' ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200' : 'border-rose-400/60 bg-rose-400/15 text-rose-200'}`}>
      {side === 'long' ? '▲ LONG' : '▼ SHORT'}
    </span>
  );
}

function TradeCard({ row, rank }: { row: RecommendRow; rank: 'top' | number }) {
  const isTop = rank === 'top';
  const riskAmt = Math.abs(row.entryPrice - row.stopLossPrice);
  const rewardAmt = Math.abs(row.tp1Price - row.entryPrice);

  return (
    <div className={`rounded-3xl border p-6 ${isTop
      ? 'border-amber-300/40 bg-linear-to-br from-amber-300/10 via-black/30 to-black/40 shadow-lg shadow-amber-900/20'
      : 'border-white/10 bg-black/25'
    }`}>
      {isTop && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <span className="text-sm font-bold uppercase tracking-widest text-amber-300">HOTTEST TRADE NOW</span>
        </div>
      )}
      {typeof rank === 'number' && (
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400">Runner-up #{rank}</div>
      )}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-white">{row.symbol}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{row.pair}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SideBadge side={row.tradeSide} />
          <ConfidenceBadge level={row.confidence} />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">LTP</p>
          <p className="mt-1 text-lg font-semibold text-white">₹{formatPrice(row.ltp)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">RVOL20</p>
          <p className="mt-1 text-lg font-semibold text-white">{row.rvol20.toFixed(2)}x</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">R:R</p>
          <p className="mt-1 text-lg font-semibold text-white">1 : {row.rrRatio.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Signal Age</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatMins(row.minutesSinceSignal)}</p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="rounded-2xl border border-white/15 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Entry</p>
          <p className="mt-1 font-semibold text-white">₹{formatPrice(row.entryPrice)}</p>
        </div>
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-3">
          <p className="text-xs uppercase tracking-wider text-rose-300">Stop Loss</p>
          <p className="mt-1 font-semibold text-rose-200">₹{formatPrice(row.stopLossPrice)}</p>
          <p className="text-xs text-rose-300/70">risk ₹{formatPrice(riskAmt)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/8 p-3">
          <p className="text-xs uppercase tracking-wider text-emerald-300">TP1</p>
          <p className="mt-1 font-semibold text-emerald-200">₹{formatPrice(row.tp1Price)}</p>
          <p className="text-xs text-emerald-300/70">+₹{formatPrice(rewardAmt)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/6 p-3">
          <p className="text-xs uppercase tracking-wider text-emerald-300">TP2</p>
          <p className="mt-1 font-semibold text-emerald-200">₹{formatPrice(row.tp2Price)}</p>
        </div>
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/5 p-3">
          <p className="text-xs uppercase tracking-wider text-emerald-300">TP3</p>
          <p className="mt-1 font-semibold text-emerald-200">₹{formatPrice(row.tp3Price)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Impulse {formatPercent(row.oneHourChangePct)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          ST Gap {formatPercent(row.supertrendGapPct)}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Breakout {formatPercent(Math.abs(row.breakout20Pct))}
        </span>
        <span className={`rounded-full border px-3 py-1 ${row.freshBurstSignal ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200' : 'border-white/10 bg-white/5 text-zinc-300'}`}>
          {row.freshBurstSignal ? 'Fresh Burst' : 'Burst'}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Status: {row.supertrendStatus.replace('_', ' ')}
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Score: {row.convictionScore.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export default function RecommendPage() {
  const [data, setData] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL_MS / 1000);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);
  const [signalPreset, setSignalPreset] = useState<SignalPreset>('balanced');
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenSignalKeysRef = useRef<Set<string>>(new Set());
  const hasInitializedSignalsRef = useRef(false);

  const playChime = (level: 'HIGH' | 'MEDIUM' | 'LOW') => {
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

    if (level === 'HIGH') {
      // Three ascending notes — loud and urgent
      const freqs = [880, 1047, 1568];
      const delays = [0, 0.18, 0.36];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + delays[idx]);
        gain.gain.setValueAtTime(0.0001, now + delays[idx]);
        gain.gain.exponentialRampToValueAtTime(0.32, now + delays[idx] + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.1, now + delays[idx] + 0.18);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delays[idx] + 0.38);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delays[idx]);
        osc.stop(now + delays[idx] + 0.4);
      });
    } else if (level === 'MEDIUM') {
      // Brighter two-tone chime — noticeably different from LOW
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1047, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.26, now + 0.025);
      gain1.gain.exponentialRampToValueAtTime(0.08, now + 0.22);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.46);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1397, now + 0.14);
      gain2.gain.setValueAtTime(0.0001, now + 0.14);
      gain2.gain.exponentialRampToValueAtTime(0.19, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.06, now + 0.32);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.14);
      osc2.stop(now + 0.6);
    } else {
      // LOW — original soft chime
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.2, now + 0.03);
      gain1.gain.exponentialRampToValueAtTime(0.06, now + 0.2);
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.44);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1174, now + 0.12);
      gain2.gain.setValueAtTime(0.0001, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.14, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.05, now + 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.6);
    }
  };

  const fetchRecommend = useCallback(async (silent = false) => {
    const excluded = parseExcludedPairsText(
      window.localStorage.getItem(STORAGE_KEY) || DEFAULT_EXCLUDED_PAIRS.join('\n')
    );
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedPairs: excluded, preset: signalPreset }),
      });
      if (!res.ok) throw new Error('Failed');
      const result: RecommendResponse = await res.json();
      setData(result);
      setLastFetchedAt(new Date());
      setCountdown(REFRESH_INTERVAL_MS / 1000);
    } catch {
      setError('Failed to load recommendation. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [signalPreset]);

  // Initial fetch + auto-refresh every 5 minutes
  useEffect(() => {
    fetchRecommend();
    const interval = setInterval(() => fetchRecommend(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchRecommend]);

  // Countdown ticker
  useEffect(() => {
    const tick = setInterval(() => setCountdown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!data) return;

    const candidateRows = [data.top, ...data.runners].filter((row): row is RecommendRow => Boolean(row));
    const currentSignalKeys = new Set(candidateRows.map((row) => `${row.pair}:${row.tradeSide}:${row.lastSignalTimestamp || 0}`));

    if (!hasInitializedSignalsRef.current) {
      seenSignalKeysRef.current = currentSignalKeys;
      hasInitializedSignalsRef.current = true;
      return;
    }

    const newRows = candidateRows.filter((row) => {
      const key = `${row.pair}:${row.tradeSide}:${row.lastSignalTimestamp || 0}`;
      return !seenSignalKeysRef.current.has(key);
    });
    if (newRows.length > 0) {
      const topLevel = newRows.some((r) => r.confidence === 'HIGH')
        ? 'HIGH'
        : newRows.some((r) => r.confidence === 'MEDIUM')
          ? 'MEDIUM'
          : 'LOW';
      playChime(topLevel);
    }

    seenSignalKeysRef.current = currentSignalKeys;
  }, [data, soundAlertsEnabled]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const navLinks = (
    <div className="flex flex-wrap gap-2">
      {[
        { href: '/burst', label: 'Burst' },
        { href: '/fresh-burst', label: 'Fresh Burst' },
        { href: '/short', label: 'Short' },
        { href: '/wild', label: 'Wild' },
        { href: '/recommend', label: '🔥 Recommend', active: true },
      ].map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] ${
            link.active
              ? 'border-amber-300/45 bg-amber-300/20 text-amber-100'
              : 'border-white/20 text-zinc-300 hover:border-zinc-300'
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.12),transparent_35%),linear-gradient(180deg,#09090b_0%,#111827_45%,#020617_100%)] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">

        {/* Header */}
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur">
          <div className="border-b border-white/10 px-5 py-6 lg:px-8">
            <div className="mb-3">{navLinks}</div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              🔥 Hottest Trade Now
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300">
              One best trade across all pairs and sides — scored by recency, RVOL, breakout strength, and risk/reward. Auto-refreshes every 5 minutes.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
            <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
              {data && (
                <>
                  <span>Scanned <strong className="text-white">{data.scannedPairs}</strong> pairs</span>
                  <span>Candidates <strong className="text-amber-300">{data.hotCandidates}</strong></span>
                  <span>Last updated <strong className="text-white">{lastFetchedAt?.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) ?? '-'}</strong></span>
                </>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
              <span className="text-xs text-zinc-500 sm:text-right">Next refresh in {countdown}s</span>
              <select
                value={signalPreset}
                onChange={(event) => setSignalPreset(event.target.value as SignalPreset)}
                className="h-9 w-full rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-semibold text-cyan-100 outline-none sm:w-auto"
              >
                <option value="aggressive">Preset: Aggressive</option>
                <option value="balanced">Preset: Balanced</option>
                <option value="strict">Preset: Strict</option>
              </select>
              <button
                onClick={() => setSoundAlertsEnabled((prev) => !prev)}
                className={`inline-flex h-9 w-full items-center justify-center rounded-full border px-3 text-xs font-semibold transition sm:w-auto ${
                  soundAlertsEnabled
                    ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/20'
                    : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/20'
                }`}
              >
                New Entry Chime: {soundAlertsEnabled ? 'On' : 'Off'}
              </button>
              <button
                onClick={() => fetchRecommend(true)}
                disabled={refreshing}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-full bg-amber-400 px-4 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-60 sm:w-auto"
              >
                {refreshing ? 'Scanning...' : 'Refresh Now'}
              </button>
            </div>
          </div>
        </section>

        {/* Content */}
        {loading ? (
          <div className="flex min-h-80 items-center justify-center rounded-3xl border border-white/10 bg-black/25 py-16">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-300/25 border-t-amber-300"></div>
              <p className="mt-4 text-sm font-medium text-zinc-300">Scanning all pairs for hottest trade...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center">
            <p className="font-semibold text-rose-300">{error}</p>
            <button onClick={() => fetchRecommend()} className="mt-4 rounded-full bg-rose-400 px-5 py-2 text-sm font-semibold text-zinc-950">Retry</button>
          </div>
        ) : !data?.top ? (
          <div className="rounded-3xl border border-white/10 bg-black/25 px-6 py-16 text-center">
            <p className="text-4xl">😴</p>
            <p className="mt-4 text-lg font-semibold text-zinc-200">No hottest trade found right now</p>
            <p className="mt-2 text-sm text-zinc-400">No eligible burst signals with strong conviction in the current preset window. Check back soon.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <TradeCard row={data.top} rank="top" />
            {data.runners.length > 0 && (
              <>
                <p className="px-1 text-xs font-semibold uppercase tracking-widest text-zinc-400">Other candidates</p>
                {data.runners.map((row, i) => (
                  <TradeCard key={row.pair + row.tradeSide} row={row} rank={i + 1} />
                ))}
              </>
            )}
          </div>
        )}

        {/* Disclaimer */}
        <p className="px-2 text-center text-xs text-zinc-600">
          Not financial advice. All signals are algorithmically generated. Always use your own judgment and manage risk accordingly.
        </p>
      </div>
    </main>
  );
}
