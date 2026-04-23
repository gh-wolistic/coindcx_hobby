import { NextRequest, NextResponse } from 'next/server';
import { runSingleScan, type AlertPreset } from '@/lib/alerter';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max execution

/**
 * Background worker endpoint for continuous alerting
 * Can be triggered by cron or manually
 */
export async function GET(request: NextRequest) {
  // Verify authorization (optional but recommended for production)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const preset = (searchParams.get('preset') || 'balanced') as AlertPreset;
    
    console.log(`[WORKER] Starting alerter scan with preset: ${preset}`);
    
    const startTime = Date.now();
    await runSingleScan(preset);
    const elapsed = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      preset,
      elapsedMs: elapsed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[WORKER] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Manual trigger with custom parameters
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const preset = (body.preset || 'balanced') as AlertPreset;
    
    console.log(`[WORKER] Manual scan triggered with preset: ${preset}`);
    
    const startTime = Date.now();
    await runSingleScan(preset);
    const elapsed = Date.now() - startTime;
    
    return NextResponse.json({
      success: true,
      preset,
      elapsedMs: elapsed,
      timestamp: new Date().toISOString(),
      message: 'Scan completed successfully',
    });
  } catch (error) {
    console.error('[WORKER] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
