'use client';

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CandleChartProps {
  data: any[];
  symbol: string;
}

export default function CandleChart({ data }: CandleChartProps) {
  if (!data || data.length === 0) {
    return <div className="text-gray-500">No data available</div>;
  }

  const chartData = data.map((candle: any) => {
    const open = typeof candle.open === 'number' ? candle.open : parseFloat(candle.open);
    const high = typeof candle.high === 'number' ? candle.high : parseFloat(candle.high);
    const low = typeof candle.low === 'number' ? candle.low : parseFloat(candle.low);
    const close = typeof candle.close === 'number' ? candle.close : parseFloat(candle.close);
    const time = new Date(candle.time).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return {
      time,
      open,
      close,
      high,
      low,
      volume: candle.volume || 0,
    };
  });

  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" />
          <Tooltip formatter={(value) => value} labelFormatter={(label) => `Time: ${label}`} />
          <Bar yAxisId="left" dataKey="close" fill="#3b82f6" name="Close Price" isAnimationActive={false} />
          <Line yAxisId="left" type="monotone" dataKey="high" stroke="#10b981" name="High" dot={false} isAnimationActive={false} />
          <Line yAxisId="left" type="monotone" dataKey="low" stroke="#ef4444" name="Low" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}