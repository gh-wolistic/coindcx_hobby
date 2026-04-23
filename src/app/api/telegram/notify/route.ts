import { NextRequest, NextResponse } from 'next/server';
import { sendBulkRecommendations, sendTradeRecommendation } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (body.trade) {
      // Send single trade
      const success = await sendTradeRecommendation(body.trade);
      return NextResponse.json({ success, message: success ? 'Notification sent' : 'Failed to send' });
    }

    if (body.trades && Array.isArray(body.trades)) {
      // Send multiple trades
      await sendBulkRecommendations(body.trades);
      return NextResponse.json({ success: true, message: `Sent ${body.trades.length} notifications` });
    }

    return NextResponse.json({ success: false, message: 'Invalid request body' }, { status: 400 });
  } catch (error) {
    console.error('Telegram notify error:', error);
    return NextResponse.json({ success: false, message: String(error) }, { status: 500 });
  }
}
