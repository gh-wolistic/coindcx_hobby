import { NextResponse } from 'next/server';
import { calculateSupertrend } from '@/lib/supertrend';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');
    const period = parseInt(searchParams.get('period') || '10', 10);
    const multiplier = parseFloat(searchParams.get('multiplier') || '3');

    if (!pair) {
      return NextResponse.json(
        { error: 'pair is required' },
        { status: 400 }
      );
    }

    // Fetch ~200 hourly candles for accurate ATR warm-up (period=10 needs warm-up candles)
    const now = Math.floor(Date.now() / 1000);
    const lookback = now - (200 * 60 * 60); // 200 hours back

    // Fetch 1-hour candlestick data for futures (resolution=60 = 1h)
    const response = await fetch(
      `https://public.coindcx.com/market_data/candlesticks?pair=${pair}&from=${lookback}&to=${now}&resolution=60&pcode=f`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to fetch futures candle data');
    }

    const data = await response.json();

    if (data.s === 'ok' && data.data && Array.isArray(data.data)) {
      // Normalize candle data
      const candles = data.data.map((candle: any) => ({
        open: typeof candle.open === 'number' ? candle.open : parseFloat(candle.open),
        high: typeof candle.high === 'number' ? candle.high : parseFloat(candle.high),
        low: typeof candle.low === 'number' ? candle.low : parseFloat(candle.low),
        close: typeof candle.close === 'number' ? candle.close : parseFloat(candle.close),
        volume: candle.volume || 0,
        time: candle.time,
      }));

      // Calculate Supertrend
      const supertrendData = calculateSupertrend(candles, period, multiplier);

      return NextResponse.json({
        pair,
        current: supertrendData.current,
        signals: supertrendData.signals,
        ltpValue: candles[candles.length - 1]?.close || 0,
        candles: candles.slice(-24), // Last 24 candles for chart
      });
    }

    return NextResponse.json({
      pair,
      current: { value: 0, direction: 'uptrend' },
      signals: [],
      ltpValue: 0,
      candles: [],
    });
  } catch (error) {
    console.error('Error fetching supertrend data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supertrend data' },
      { status: 500 }
    );
  }
}
