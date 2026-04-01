import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pair = searchParams.get('pair');

    if (!pair) {
      return NextResponse.json(
        { error: 'pair is required' },
        { status: 400 }
      );
    }

    // Calculate timestamps for last 24 hours (in seconds)
    const now = Math.floor(Date.now() / 1000);
    const oneDayAgo = now - (24 * 60 * 60);

    // Fetch 1-hour candlestick data for futures (last 24 hours, resolution=60 = 1h)
    const response = await fetch(
      `https://public.coindcx.com/market_data/candlesticks?pair=${pair}&from=${oneDayAgo}&to=${now}&resolution=60&pcode=f`,
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
    
    // Return candles in expected format
    if (data.s === 'ok' && data.data) {
      return NextResponse.json(data.data);
    }

    return NextResponse.json([]);
  } catch (error) {
    console.error('Error fetching candle data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch candle data' },
      { status: 500 }
    );
  }
}
