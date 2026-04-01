'use client';

import { useState, useEffect } from 'react';
import SupertrendTab from './SupertrendTab';

interface PriceCardProps {
  instrument: any;
  allInstruments?: any[];
}

export default function PriceCard({ instrument, allInstruments = [] }: PriceCardProps) {
  const [ohlc, setOhlc] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'supertrend'>('overview');

  const getVolumeColor = () => {
    if (!instrument.volume_24h || allInstruments.length === 0) return { bg: 'bg-blue-50', text: 'text-blue-700' };

    const volumes = allInstruments.map((i: any) => i.volume_24h || 0);
    const avgVolume = volumes.reduce((a: any, b: any) => a + b, 0) / volumes.length;
    const vol = instrument.volume_24h;

    if (vol > avgVolume * 1.5) {
      return { bg: 'bg-green-100', text: 'text-green-700' };
    } else if (vol > avgVolume) {
      return { bg: 'bg-yellow-100', text: 'text-yellow-700' };
    } else if (vol > avgVolume * 0.5) {
      return { bg: 'bg-orange-100', text: 'text-orange-700' };
    } else {
      return { bg: 'bg-red-100', text: 'text-red-700' };
    }
  };

  useEffect(() => {
    const fetchOHLC = async () => {
      try {
        const response = await fetch(`/api/candles?pair=${instrument.pair}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const data = await response.json();
        if (data && data.length > 0) {
          const latestCandle = data[data.length - 1];
          setOhlc({
            open: latestCandle.open,
            high: latestCandle.high,
            low: latestCandle.low,
            close: latestCandle.close,
          });
        }
      } catch (err) {
        console.error('Failed to load OHLC:', err);
      }
    };
    fetchOHLC();
  }, [instrument.pair]);

  const latestPrice =
    typeof instrument.last_traded_price === 'number'
      ? instrument.last_traded_price
      : parseFloat(String(instrument.last_traded_price)) || 'N/A';
  const highPrice = typeof instrument.day_high_price === 'number' ? instrument.day_high_price : parseFloat(instrument.day_high_price) || 0;
  const lowPrice = typeof instrument.day_low_price === 'number' ? instrument.day_low_price : parseFloat(instrument.day_low_price) || 0;

  const change24h =
    highPrice && lowPrice && highPrice > 0 ? ((parseFloat(String(latestPrice)) - lowPrice) / lowPrice * 100).toFixed(2) : 'N/A';

  const getColorClass = () => {
    if (!ohlc?.open || !ohlc?.close) return 'bg-gray-50';

    const diff = parseFloat(ohlc.close) - parseFloat(ohlc.open);
    const percentChange = (diff / parseFloat(ohlc.open)) * 100;

    if (percentChange > 1) return 'bg-green-50 border-green-300';
    if (percentChange < -1) return 'bg-red-50 border-red-300';
    return 'bg-orange-50 border-orange-300';
  };

  const getOhlcColor = () => {
    if (!ohlc?.open || !ohlc?.close) return 'text-gray-900';

    const diff = parseFloat(ohlc.close) - parseFloat(ohlc.open);
    const percentChange = (diff / parseFloat(ohlc.open)) * 100;

    if (percentChange > 1) return 'text-green-700';
    if (percentChange < -1) return 'text-red-700';
    return 'text-orange-700';
  };

  return (
    <div className="bg-white border-2 border-blue-200 rounded-lg overflow-hidden hover:shadow-xl transition-shadow hover:border-blue-400">
      <div className="p-5 pb-3">
        <div className="flex justify-between items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-xl font-bold text-blue-900">{instrument.symbol}</h3>
              <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700">ST</span>
            </div>
            <p className="text-sm text-blue-600 font-medium">{instrument.market}</p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-blue-900">₹{latestPrice}</p>
            <p
              className={`text-base font-bold ${
                change24h !== 'N/A' && parseFloat(change24h) >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {change24h !== 'N/A' ? `${change24h}%` : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-5 border-b-2 border-blue-100">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'overview' ? 'text-blue-700 border-blue-600' : 'text-gray-600 border-transparent hover:text-blue-600'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('supertrend')}
          className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'supertrend' ? 'text-blue-700 border-blue-600' : 'text-gray-600 border-transparent hover:text-blue-600'
          }`}
        >
          Supertrend
        </button>
      </div>

      <div className="p-5">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 bg-blue-50 p-3 rounded-lg">
              <div>
                <p className="text-xs text-blue-600 font-semibold">24H High</p>
                <p className="font-bold text-blue-900">₹{highPrice > 0 ? highPrice : 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-blue-600 font-semibold">24H Low</p>
                <p className="font-bold text-blue-900">₹{lowPrice > 0 ? lowPrice : 'N/A'}</p>
              </div>
              <div className={`${getVolumeColor().bg} p-2 rounded`}>
                <p className={`text-xs font-semibold ${getVolumeColor().text}`}>Volume</p>
                <p className={`font-bold ${getVolumeColor().text}`}>
                  {instrument.volume_24h ? (parseFloat(String(instrument.volume_24h)) / 1e6).toFixed(2) : 'N/A'}M
                </p>
              </div>
            </div>

            <div className={`grid grid-cols-4 gap-2 p-3 rounded-lg border-2 ${getColorClass()}`}>
              <div>
                <p className="text-xs font-semibold" style={{ color: getOhlcColor() === 'text-green-700' ? '#059669' : getOhlcColor() === 'text-red-700' ? '#b91c1c' : '#b45309' }}>Open</p>
                <p className={`font-bold ${getOhlcColor()}`}>₹{ohlc?.open ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: getOhlcColor() === 'text-green-700' ? '#059669' : getOhlcColor() === 'text-red-700' ? '#b91c1c' : '#b45309' }}>High</p>
                <p className={`font-bold ${getOhlcColor()}`}>₹{ohlc?.high ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: getOhlcColor() === 'text-green-700' ? '#059669' : getOhlcColor() === 'text-red-700' ? '#b91c1c' : '#b45309' }}>Low</p>
                <p className={`font-bold ${getOhlcColor()}`}>₹{ohlc?.low ?? 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: getOhlcColor() === 'text-green-700' ? '#059669' : getOhlcColor() === 'text-red-700' ? '#b91c1c' : '#b45309' }}>Close</p>
                <p className={`font-bold ${getOhlcColor()}`}>₹{ohlc?.close ?? 'N/A'}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'supertrend' && <SupertrendTab pair={instrument.pair} pairId={instrument.pair_id} />}
      </div>
    </div>
  );
}