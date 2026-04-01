'use client';

import { useState, useEffect } from 'react';
import { getSuperTrendStatus } from '@/lib/supertrend';

interface SupertrendData {
  pair: string;
  current: {
    value: number;
    direction: 'uptrend' | 'downtrend';
  };
  signals: Array<{
    type: 'direction_change' | 'ltp_cross';
    timestamp: number;
    prevValue: number;
    currValue: number;
    direction: 'uptrend' | 'downtrend';
  }>;
  ltpValue: number;
}

interface SupertrendTabProps {
  pair: string;
  pairId: string;
}

export default function SupertrendTab({ pair }: SupertrendTabProps) {
  const [data, setData] = useState<SupertrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSupertrend = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/supertrend?pair=${pair}`);
        if (!response.ok) {
          throw new Error('Failed to fetch supertrend data');
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError('Failed to load supertrend data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSupertrend();
    const interval = setInterval(fetchSupertrend, 60000);

    return () => clearInterval(interval);
  }, [pair]);

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-3 border-blue-300 border-t-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-blue-600 font-medium">Loading supertrend...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <p className="text-sm font-medium">{error || 'No data available'}</p>
      </div>
    );
  }

  const status = getSuperTrendStatus(data.ltpValue, data.current.value, data.signals);
  const ltpStr = String(data.ltpValue);
  const ltpDecimals = ltpStr.includes('.') ? ltpStr.split('.')[1].length : 2;
  const fmt = (n: number) => n.toFixed(ltpDecimals);

  const getStatusDisplay = () => {
    switch (status.type) {
      case 'above':
        return {
          label: 'LTP Above Supertrend',
          icon: '↑',
          color: 'bg-green-50 border-green-300',
          textColor: 'text-green-700',
          iconColor: 'text-green-600',
        };
      case 'below':
        return {
          label: 'LTP Below Supertrend',
          icon: '↓',
          color: 'bg-red-50 border-red-300',
          textColor: 'text-red-700',
          iconColor: 'text-red-600',
        };
      case 'crossed_above':
        return {
          label: 'Just Crossed Above',
          icon: '⚡',
          color: 'bg-green-100 border-green-400',
          textColor: 'text-green-900 font-bold',
          iconColor: 'text-green-600',
        };
      case 'crossed_below':
        return {
          label: 'Just Crossed Below',
          icon: '⚡',
          color: 'bg-red-100 border-red-400',
          textColor: 'text-red-900 font-bold',
          iconColor: 'text-red-600',
        };
    }
  };

  const displayInfo = getStatusDisplay();

  return (
    <div className="space-y-4">
      <div className={`rounded-lg p-6 border-2 ${displayInfo.color}`}>
        <div className="flex items-center gap-4 mb-4">
          <span className={`text-5xl ${displayInfo.iconColor}`}>{displayInfo.icon}</span>
          <div>
            <p className={`text-2xl font-bold ${displayInfo.textColor}`}>{displayInfo.label}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-current border-opacity-20 pt-4">
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Supertrend Value</p>
            <p className="text-xl font-bold text-gray-900">₹{fmt(data.current.value)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Current LTP</p>
            <p className="text-xl font-bold text-gray-900">₹{fmt(data.ltpValue)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Distance</p>
            <p className="text-lg font-bold text-gray-900">{status.percentDistance.toFixed(2)}%</p>
            <p className="text-xs text-gray-600">₹{fmt(status.distance)}</p>
          </div>
        </div>
      </div>

      <div
        className={`rounded-lg p-4 border-2 ${
          data.current.direction === 'uptrend' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
        }`}
      >
        <p className="text-xs font-semibold text-gray-600 mb-2">Trend Direction</p>
        <div className="flex items-center gap-2">
          <span className={`text-3xl ${data.current.direction === 'uptrend' ? 'text-green-600' : 'text-red-600'}`}>
            {data.current.direction === 'uptrend' ? '↑' : '↓'}
          </span>
          <span className={`text-lg font-bold ${data.current.direction === 'uptrend' ? 'text-green-700' : 'text-red-700'}`}>
            {data.current.direction === 'uptrend' ? 'Uptrend' : 'Downtrend'}
          </span>
        </div>
      </div>
    </div>
  );
}