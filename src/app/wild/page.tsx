'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_EXCLUDED_PAIRS,
  parseExcludedPairsText,
  type WildResponse,
  type WildRow,
} from '@/lib/screener';

const STORAGE_KEY = 'coindcx-screener-excluded-pairs';
const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_NEAR_THRESHOLD_PCT = 1.0;

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  const digits = value >= 1000 ? 2 : value >= 10 ? 3 : 4;
  return value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatMinsFromTimestamp(signalTimestamp: number): string {
  const tsMs = signalTimestamp > 1e12 ? signalTimestamp : signalTimestamp * 1000;
  const mins = Math.max(0, (Date.now() - tsMs) / 60000);
  if (mins < 1) return '< 1 min ago';
  if (mins < 60) return `${Math.floor(mins)} min ago`;
  return `${(mins / 60).toFixed(1)}h ago`;
}

function SideBadge({ side }: { side: 'long' | 'short' }) {
  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${
        side === 'long'
          ? 'border-emerald-400/60 bg-emerald-400/15 text-emerald-200'
          : 'border-rose-400/60 bg-rose-400/15 text-rose-200'
      }`}
    >
      {side === 'long' ? '▲ Bullish Body' : '▼ Bearish Body'}
    </span>
  );
}

function WildCard({ row }: { row: WildRow }) {
  const riskAmt = Math.abs(row.entryPrice - row.stopLossPrice);
  const rewardAmt = Math.abs(row.tp1Price - row.entryPrice);

  return (
    <article className="rounded-3xl border border-white/10 bg-black/25 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-2xl font-bold text-white">{row.symbol}</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{row.pair}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SideBadge side={row.tradeSide} />
          <span className="rounded-full border border-amber-300/45 bg-amber-300/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-200">
            Wild
          </span>
          {row.supertrendCross && (
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-widest ${
                row.supertrendCross === 'crossed_above'
                  ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100'
                  : 'border-fuchsia-300/45 bg-fuchsia-300/15 text-fuchsia-100'
              }`}
            >
              {row.supertrendCross === 'crossed_above' ? 'ST Cross Up' : 'ST Cross Down'}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">LTP</p>
          <p className="mt-1 text-lg font-semibold text-white">₹{formatPrice(row.ltp)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Body Multiple</p>
          <p className="mt-1 text-lg font-semibold text-white">{row.bodyMultiple.toFixed(2)}x</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Volume Ratio</p>
          <p className="mt-1 text-lg font-semibold text-white">{row.volumeRatio.toFixed(2)}x</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-400">Signal Age</p>
          <p className="mt-1 text-sm font-semibold text-white">{formatMinsFromTimestamp(row.signalTimestamp)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Curr Body {row.currentBodyPct.toFixed(2)}%
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Prev Body {row.previousBodyPct.toFixed(2)}%
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          ST Distance {row.supertrendDistancePct.toFixed(2)}%
        </span>
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
          Vol {row.currentVolume.toFixed(0)} vs {row.previousVolume.toFixed(0)}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
    </article>
  );
}

export default function WildPage() {
  const [data, setData] = useState<WildResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState(DEFAULT_REFRESH_INTERVAL_MS);
  const [countdown, setCountdown] = useState(DEFAULT_REFRESH_INTERVAL_MS / 1000);
  const [nearThresholdPct, setNearThresholdPct] = useState(DEFAULT_NEAR_THRESHOLD_PCT);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenSignalKeysRef = useRef<Set<string>>(new Set());
  const hasInitializedSignalsRef = useRef(false);

  const playWildChime = useCallback(() => {
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
    const freqs = [784, 988, 1319, 1568];
    const delays = [0, 0.22, 0.44, 0.68];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + delays[idx]);
      gain.gain.setValueAtTime(0.0001, now + delays[idx]);
      gain.gain.exponentialRampToValueAtTime(0.42, now + delays[idx] + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.18, now + delays[idx] + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delays[idx] + 0.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + delays[idx]);
      osc.stop(now + delays[idx] + 0.82);
    });
  }, [soundAlertsEnabled]);

  const fetchWild = useCallback(async (silent = false) => {
    const excluded = parseExcludedPairsText(
      window.localStorage.getItem(STORAGE_KEY) || DEFAULT_EXCLUDED_PAIRS.join('\n')
    );

    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const res = await fetch('/api/wild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          excludedPairs: excluded,
          supertrendNearThresholdPct: nearThresholdPct,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const result: WildResponse = await res.json();
      setData(result);
      setCountdown(Math.floor(refreshIntervalMs / 1000));
    } catch {
      setError('Failed to load wild signals. Check your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [nearThresholdPct, refreshIntervalMs]);

  useEffect(() => {
    fetchWild();
    const interval = setInterval(() => fetchWild(true), refreshIntervalMs);
    return () => clearInterval(interval);
  }, [fetchWild, refreshIntervalMs]);

  useEffect(() => {
    const tick = setInterval(() => setCountdown((prev) => Math.max(0, prev - 1)), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    setCountdown(Math.floor(refreshIntervalMs / 1000));
  }, [refreshIntervalMs]);

  useEffect(() => {
    hasInitializedSignalsRef.current = false;
    seenSignalKeysRef.current = new Set();
  }, [nearThresholdPct]);

  useEffect(() => {
    if (!data) return;

    const currentSignalKeys = new Set(data.rows.map((row) => `${row.pair}:${row.tradeSide}:${row.signalTimestamp}`));

    if (!hasInitializedSignalsRef.current) {
      seenSignalKeysRef.current = currentSignalKeys;
      hasInitializedSignalsRef.current = true;
      return;
    }

    const hasNewEntries = data.rows.some((row) => {
      const key = `${row.pair}:${row.tradeSide}:${row.signalTimestamp}`;
      return !seenSignalKeysRef.current.has(key);
    });

    if (hasNewEntries) {
      playWildChime();
    }

    seenSignalKeysRef.current = currentSignalKeys;
  }, [data, playWildChime]);

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
        { href: '/recommend', label: 'Recommend' },
        { href: '/wild', label: 'Wild', active: true },
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
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur">
          <div className="border-b border-white/10 px-5 py-6 lg:px-8">
            <div className="mb-3">{navLinks}</div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Wild 1H OC Bursts</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-300">
              Fast momentum scanner. Detailed logic is in docs.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
            <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
              {data && (
                <>
                  <span>
                    Scanned <strong className="text-white">{data.scannedPairs}</strong> pairs
                  </span>
                  <span>
                    Wild matches <strong className="text-amber-300">{data.matchedPairs}</strong>
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={nearThresholdPct}
                onChange={(event) => setNearThresholdPct(parseFloat(event.target.value))}
                className="h-9 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 text-xs font-semibold text-cyan-100 outline-none"
              >
                <option value={0.5}>ST Near: 0.5%</option>
                <option value={1}>ST Near: 1.0%</option>
                <option value={1.5}>ST Near: 1.5%</option>
              </select>
              <select
                value={refreshIntervalMs}
                onChange={(event) => setRefreshIntervalMs(parseInt(event.target.value, 10))}
                className="h-9 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 text-xs font-semibold text-amber-100 outline-none"
              >
                <option value={1 * 60 * 1000}>Check: 1 min</option>
                <option value={5 * 60 * 1000}>Check: 5 min</option>
                <option value={15 * 60 * 1000}>Check: 15 min</option>
                <option value={60 * 60 * 1000}>Check: 60 min</option>
              </select>
              <button
                onClick={() => setSoundAlertsEnabled((prev) => !prev)}
                className={`inline-flex h-9 items-center justify-center rounded-full border px-3 text-xs font-semibold transition ${
                  soundAlertsEnabled
                    ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-100 hover:bg-emerald-300/20'
                    : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300 hover:bg-zinc-500/20'
                }`}
              >
                New Entry Chime: {soundAlertsEnabled ? 'On' : 'Off'}
              </button>
              <span className="text-xs text-zinc-500">Next refresh in {countdown}s</span>
              <button
                onClick={() => fetchWild(true)}
                disabled={refreshing}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-amber-400 px-4 text-xs font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-60"
              >
                {refreshing ? 'Scanning...' : 'Refresh Now'}
              </button>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center rounded-3xl border border-white/10 bg-black/25 py-16">
            <div className="text-center">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-amber-300/25 border-t-amber-300"></div>
              <p className="mt-4 text-sm font-medium text-zinc-300">Scanning for wild setups...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center">
            <p className="font-semibold text-rose-300">{error}</p>
            <button
              onClick={() => fetchWild()}
              className="mt-4 rounded-full bg-rose-400 px-5 py-2 text-sm font-semibold text-zinc-950"
            >
              Retry
            </button>
          </div>
        ) : data && data.rows.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-black/25 px-6 py-16 text-center">
            <p className="text-4xl">🌪️</p>
            <p className="mt-4 text-lg font-semibold text-zinc-200">No wild setups right now</p>
            <p className="mt-2 text-sm text-zinc-400">
              Waiting for qualifying wild setups.
            </p>
          </div>
        ) : (
          <section className="grid gap-4">
            {data?.rows.map((row) => (
              <WildCard key={`${row.pair}:${row.signalTimestamp}`} row={row} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
