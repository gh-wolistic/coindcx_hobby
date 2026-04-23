import { NextRequest, NextResponse } from 'next/server';
import { analyzeMultiTimeframe } from '@/lib/multiTimeframe';
import { sendEnhancedSignal } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

/**
 * Enhanced recommend endpoint with multi-timeframe analysis
 * GET /api/recommend-enhanced?pair=B-BTC_USDT&ltp=50000
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const pair = searchParams.get('pair');
    const ltpStr = searchParams.get('ltp');
    const sendAlert = searchParams.get('sendAlert') === 'true';
    
    if (!pair || !ltpStr) {
      return NextResponse.json(
        { error: 'Missing required parameters: pair and ltp' },
        { status: 400 }
      );
    }
    
    const ltp = parseFloat(ltpStr);
    if (!ltp || ltp <= 0) {
      return NextResponse.json(
        { error: 'Invalid ltp value' },
        { status: 400 }
      );
    }
    
    const signal = await analyzeMultiTimeframe(pair, ltp);
    
    if (!signal) {
      return NextResponse.json({
        signal: null,
        message: 'No signal detected for this pair',
      });
    }
    
    // Optionally send Telegram alert
    if (sendAlert) {
      await sendEnhancedSignal(signal, 'manual');
    }
    
    return NextResponse.json({
      signal,
      message: 'Signal detected successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Recommend enhanced error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Bulk analysis endpoint
 * POST /api/recommend-enhanced with { pairs: string[], sendTopSignal: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const pairs: string[] = body.pairs || [];
    const sendTopSignal = body.sendTopSignal || false;
    
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return NextResponse.json(
        { error: 'pairs array is required' },
        { status: 400 }
      );
    }
    
    // Fetch live prices
    const pricesRes = await fetch(
      'https://public.coindcx.com/market_data/v3/current_prices/futures/rt',
      { cache: 'no-store' }
    );
    
    let prices: Record<string, any> = {};
    if (pricesRes.ok) {
      const pricesData = await pricesRes.json();
      prices = pricesData?.prices || {};
    }
    
    // Analyze all pairs in parallel
    const results = await Promise.allSettled(
      pairs.map(async (pair) => {
        const priceData = prices[pair];
        const ltp = priceData?.ls ? parseFloat(priceData.ls) : 0;
        if (!ltp) return null;
        
        return analyzeMultiTimeframe(pair, ltp);
      })
    );
    
    const signals = results
      .map((r) => r.status === 'fulfilled' ? r.value : null)
      .filter((s): s is NonNullable<typeof s> => s !== null)
      .sort((a, b) => b.score - a.score);
    
    // Send alert for top signal if requested
    if (sendTopSignal && signals.length > 0) {
      await sendEnhancedSignal(signals[0], 'bulk');
    }
    
    return NextResponse.json({
      totalPairs: pairs.length,
      signalsDetected: signals.length,
      topSignal: signals[0] || null,
      allSignals: signals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Bulk recommend error:', error);
    return NextResponse.json(
      { error: String(error) },
      { status: 500 }
    );
  }
}
