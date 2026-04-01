'use client';

import { useState, useEffect } from 'react';
import PriceCard from '@/archive/components/PriceCard';
import { getSuperTrendStatus } from '@/lib/supertrend';

interface Instrument {
  symbol: string;
  pair_id: string;
  market: string;
  last_traded_price: number;
  day_high_price: number;
  day_low_price: number;
  volume_24h: number;
}

export default function ArchivedDashboardPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [volumeFilter, setVolumeFilter] = useState<'all' | 'high' | 'low' | 'increasing'>('all');
  const [supertrendFilter, setSupertrendFilter] = useState<'all' | 'above' | 'below' | 'crossed_above' | 'crossed_below'>('all');
  const [supertrendCache, setSupertrendCache] = useState<Map<string, any>>(new Map());
  const [fetchingSupertrendData, setFetchingSupertrendData] = useState(false);

  useEffect(() => {
    fetchInstruments();
  }, []);

  const fetchInstruments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/instruments');
      if (!response.ok) {
        throw new Error('Failed to fetch instruments');
      }
      const data = await response.json();

      const sorted = (data || []).sort((a: { symbol: string }, b: { symbol: string }) =>
        a.symbol.localeCompare(b.symbol)
      );

      setInstruments(sorted);
    } catch (err) {
      setError('Failed to load trading pairs. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (supertrendFilter === 'all' || instruments.length === 0) {
      setFetchingSupertrendData(false);
      return;
    }

    const fetchSupertrendForFiltered = async () => {
      setFetchingSupertrendData(true);
      const newCache = new Map(supertrendCache);

      for (const instrument of instruments) {
        if (!newCache.has(instrument.pair_id)) {
          try {
            const response = await fetch(`/api/supertrend?pair=${instrument.symbol}`);
            if (response.ok) {
              const data = await response.json();
              newCache.set(instrument.pair_id, data);
            }
          } catch (err) {
            console.error(`Failed to fetch supertrend for ${instrument.symbol}:`, err);
          }
        }
      }

      setSupertrendCache(newCache);
      setFetchingSupertrendData(false);
    };

    fetchSupertrendForFiltered();
  }, [supertrendFilter, instruments]);

  const filteredInstruments = instruments
    .filter((inst) => {
      const matchesSearch =
        inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.market.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (volumeFilter !== 'all') {
        const volumes = instruments.map((i) => i.volume_24h || 0);
        const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;

        if (volumeFilter === 'high') {
          if (!(inst.volume_24h && inst.volume_24h > avgVolume * 1.5)) return false;
        } else if (volumeFilter === 'low') {
          if (!(inst.volume_24h && inst.volume_24h < avgVolume * 0.5)) return false;
        } else if (volumeFilter === 'increasing') {
          if (!(inst.volume_24h && inst.volume_24h > avgVolume)) return false;
        }
      }

      if (supertrendFilter !== 'all') {
        const supertrendData = supertrendCache.get(inst.pair_id);
        if (!supertrendData) return false;

        const status = getSuperTrendStatus(
          supertrendData.ltpValue,
          supertrendData.current.value,
          supertrendData.signals
        );

        if (status.type !== supertrendFilter) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      if (volumeFilter === 'increasing') {
        return (b.volume_24h || 0) - (a.volume_24h || 0);
      }
      return a.symbol.localeCompare(b.symbol);
    });

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-blue-900 mb-2">CoinDCX Futures Dashboard</h1>
          <p className="text-blue-700">
            Real-time prices and 1-hour candle charts for active futures contracts (INR)
          </p>
        </div>

        <div className="flex justify-between items-center mb-6 gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by symbol or market..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-white border-2 border-blue-300 text-blue-900 placeholder-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={fetchInstruments}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md"
          >
            Refresh
          </button>
        </div>

        <div className="mb-6 flex gap-3 items-center flex-wrap">
          <span className="text-sm font-semibold text-blue-900">Volume:</span>
          <button
            onClick={() => setVolumeFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              volumeFilter === 'all'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setVolumeFilter('high')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              volumeFilter === 'high'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-green-100 text-green-900 hover:bg-green-200'
            }`}
          >
            High Volume
          </button>
          <button
            onClick={() => setVolumeFilter('low')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              volumeFilter === 'low'
                ? 'bg-red-600 text-white shadow-lg'
                : 'bg-red-100 text-red-900 hover:bg-red-200'
            }`}
          >
            Low Volume
          </button>
          <button
            onClick={() => setVolumeFilter('increasing')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              volumeFilter === 'increasing'
                ? 'bg-yellow-600 text-white shadow-lg'
                : 'bg-yellow-100 text-yellow-900 hover:bg-yellow-200'
            }`}
          >
            Increasing Volume
          </button>
        </div>

        <div className="mb-6 flex gap-3 items-center flex-wrap">
          <span className="text-sm font-semibold text-blue-900">Supertrend:</span>
          <button
            onClick={() => setSupertrendFilter('all')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              supertrendFilter === 'all'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-blue-100 text-blue-900 hover:bg-blue-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setSupertrendFilter('above')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              supertrendFilter === 'above'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-green-100 text-green-900 hover:bg-green-200'
            }`}
          >
            LTP Above ↑
          </button>
          <button
            onClick={() => setSupertrendFilter('below')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              supertrendFilter === 'below'
                ? 'bg-red-600 text-white shadow-lg'
                : 'bg-red-100 text-red-900 hover:bg-red-200'
            }`}
          >
            LTP Below ↓
          </button>
          <button
            onClick={() => setSupertrendFilter('crossed_above')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              supertrendFilter === 'crossed_above'
                ? 'bg-green-600 text-white shadow-lg'
                : 'bg-green-100 text-green-900 hover:bg-green-200'
            }`}
          >
            Crossed Above ⚡
          </button>
          <button
            onClick={() => setSupertrendFilter('crossed_below')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all ${
              supertrendFilter === 'crossed_below'
                ? 'bg-red-600 text-white shadow-lg'
                : 'bg-red-100 text-red-900 hover:bg-red-200'
            }`}
          >
            Crossed Below ⚡
          </button>
        </div>

        <div className="border-l-4 rounded-lg p-4 mb-6 bg-blue-100 border-blue-600">
          <p className="text-blue-900 font-medium">
            {supertrendFilter !== 'all' && fetchingSupertrendData && (
              <>
                <span className="inline-block animate-spin mr-2">⚙️</span>
                Loading supertrend data...
              </>
            )}
            {(!fetchingSupertrendData || supertrendFilter === 'all') && (
              <>
                Showing <span className="font-bold">{filteredInstruments.length}</span> of{' '}
                <span className="font-bold">{instruments.length}</span> active futures contracts
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-300 border-t-blue-600 mx-auto mb-4"></div>
              <p className="text-blue-900 font-semibold">Loading futures contracts...</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-16 bg-red-50 border-2 border-red-300 rounded-lg">
            <p className="text-red-700 mb-4 font-semibold">{error}</p>
            <button
              onClick={fetchInstruments}
              className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : instruments.length === 0 ? (
          <div className="text-center py-16 bg-yellow-50 border-2 border-yellow-300 rounded-lg">
            <p className="text-yellow-800 font-semibold">No futures contracts found</p>
          </div>
        ) : filteredInstruments.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 border-2 border-gray-300 rounded-lg">
            <p className="text-gray-700 font-semibold">
              {searchQuery ? `No results matching "${searchQuery}"` : 'No instruments match the selected filters'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInstruments.map((instrument) => (
              <PriceCard key={instrument.pair_id} instrument={instrument} allInstruments={instruments} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}