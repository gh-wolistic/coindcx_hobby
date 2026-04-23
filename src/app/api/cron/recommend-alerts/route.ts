import { NextResponse } from 'next/server';
import { sendBulkRecommendations } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get the base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Fetch recommendations using the balanced preset
    const response = await fetch(`${baseUrl}/api/recommend?preset=balanced`, {
      cache: 'no-store'
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch recommendations: ${response.statusText}`);
    }
    
    const data = await response.json();
    const recommendations = data.rows || [];

    // Filter for high confidence trades only (optional - adjust as needed)
    const filteredTrades = recommendations.filter((trade: any) => 
      trade.confidence === 'HIGH' || trade.confidence === 'MEDIUM'
    );

    // Send to Telegram
    await sendBulkRecommendations(filteredTrades);

    return NextResponse.json({ 
      success: true, 
      totalRecommendations: recommendations.length,
      sentToTelegram: filteredTrades.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ 
      success: false,
      error: String(error) 
    }, { status: 500 });
  }
}
