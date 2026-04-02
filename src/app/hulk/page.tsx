'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_EXCLUDED_PAIRS, parseExcludedPairsText } from '@/lib/screener';

const STORAGE_KEY = 'coindcx-screener-excluded-pairs';
const REFRESH_MS = 5 * 60 * 1000;

interface HulkRow {
  pair: string;
  symbol: string;
  color: 'green' | 'red';
  state: 'above' | 'below' | 'crossing';
  price: number;
  hullValue: number;
  pricePosition: 'above' | 'below';
  priority: boolean;
  priorityReason: string | null;
}

interface HulkResponse {
  rows: HulkRow[];
  scannedPairs: number;
  fetchedAt: string;
}

export default function HulkPage() {
  const [rows, setRows] = useState<HulkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const priorityRows = useMemo(() => rows.filter((row) => row.priority), [rows]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return rows.filter((row) => row.symbol.toLowerCase().includes(query) || row.pair.toLowerCase().includes(query));
  }, [rows, searchQuery]);

  const fetchHulk = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);

    try {
      const excluded = parseExcludedPairsText(
        window.localStorage.getItem(STORAGE_KEY) || DEFAULT_EXCLUDED_PAIRS.join('\n')
      );

      const res = await fetch('/api/hulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedPairs: excluded }),
      });

      if (!res.ok) throw new Error('Failed to fetch HULK');
      const result: HulkResponse = await res.json();
      setRows(result.rows);
    } catch {
      setError('Failed to load HULK status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHulk();
    const id = setInterval(() => fetchHulk(true), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(52,211,153,0.12),transparent_35%),linear-gradient(180deg,#09090b_0%,#111827_45%,#020617_100%)] px-4 py-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl shadow-emerald-950/20 backdrop-blur">
          <div className="border-b border-white/10 px-5 py-6 lg:px-8">
            <div className="mb-3 flex flex-wrap gap-2">
              <Link href="/" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                Burst
              </Link>
              <Link href="/fresh-burst" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                Fresh Burst
              </Link>
              <Link href="/short" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                Short
              </Link>
              <Link href="/hot" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                HOT
              </Link>
              <Link href="/recommend" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-300 hover:border-zinc-300">
                Recommend
              </Link>
              <Link href="/hulk" className="rounded-full border border-emerald-300/40 bg-emerald-300/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                HULK
              </Link>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">HULK</h1>
            <p className="mt-2 text-sm text-zinc-300">
              Priority view shows only: green hull with price below, red hull with price above, and hull crossings. All others stay hidden unless searched.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-black/25 px-6 py-16 text-center text-zinc-300">Scanning pairs...</div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-400/10 px-6 py-12 text-center text-rose-300">{error}</div>
        ) : (
          <div className="flex flex-col gap-4">
            <section className="rounded-3xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">Priority Table</h2>
                  <p className="text-xs text-zinc-400">Showing {priorityRows.length} priority rows out of {rows.length} total.</p>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search hidden or visible pairs"
                  className="h-10 w-full rounded-xl border border-white/10 bg-black/35 px-3 text-sm text-white outline-none transition focus:border-emerald-400/60 sm:max-w-sm"
                />
              </div>

              {priorityRows.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-zinc-300">No priority rows right now.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full table-auto border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-[0.2em] text-zinc-400">
                        <th className="px-3 py-3 font-medium">Pair</th>
                        <th className="px-3 py-3 font-medium">Hull Color</th>
                        <th className="px-3 py-3 font-medium">Price vs Hull</th>
                        <th className="px-3 py-3 font-medium">State</th>
                        <th className="px-3 py-3 font-medium">Price</th>
                        <th className="px-3 py-3 font-medium">Hull</th>
                        <th className="px-3 py-3 font-medium">Priority Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priorityRows.map((row) => (
                        <tr key={`priority-${row.pair}`} className="border-b border-white/6">
                          <td className="px-3 py-3">
                            <p className="font-semibold text-white">{row.symbol}</p>
                            <p className="font-mono text-xs text-zinc-500">{row.pair}</p>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${row.color === 'green' ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' : 'border-rose-400/50 bg-rose-400/15 text-rose-200'}`}>
                              {row.color}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-zinc-200">{row.pricePosition}</td>
                          <td className="px-3 py-3 text-zinc-200">{row.state}</td>
                          <td className="px-3 py-3 text-zinc-200">{row.price.toFixed(6)}</td>
                          <td className="px-3 py-3 text-zinc-200">{row.hullValue.toFixed(6)}</td>
                          <td className="px-3 py-3 text-amber-200">{row.priorityReason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {searchQuery.trim() && (
              <section className="rounded-3xl border border-white/10 bg-black/25 p-4 sm:p-5">
                <h2 className="text-lg font-semibold text-white">Search Results (All Rows)</h2>
                <p className="mb-4 mt-1 text-xs text-zinc-400">Hidden rows are included here when they match search.</p>

                {searchResults.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-zinc-300">No rows match this search.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {searchResults.map((row) => (
                      <article key={`search-${row.pair}`} className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xl font-semibold text-white">{row.symbol}</p>
                            <p className="font-mono text-xs text-zinc-500">{row.pair}</p>
                          </div>
                          <span
                            className={`h-4 w-4 rounded-full ${row.color === 'green' ? 'bg-emerald-400' : 'bg-rose-500'}`}
                            title={row.color}
                            aria-label={row.color}
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${row.color === 'green' ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200' : 'border-rose-400/50 bg-rose-400/15 text-rose-200'}`}>
                            {row.color}
                          </span>
                          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-200">
                            price {row.pricePosition}
                          </span>
                          <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-200">
                            {row.state}
                          </span>
                          {row.priority ? (
                            <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200">
                              priority
                            </span>
                          ) : (
                            <span className="rounded-full border border-zinc-500/40 bg-zinc-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-300">
                              hidden by default
                            </span>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
