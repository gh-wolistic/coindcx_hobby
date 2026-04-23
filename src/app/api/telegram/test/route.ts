import { NextResponse } from 'next/server';
import { testTelegramConnection } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result = await testTelegramConnection();
  return NextResponse.json(result);
}
