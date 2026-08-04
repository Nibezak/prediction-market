import { NextResponse } from 'next/server'
import { loadKesPerUsdRate } from '@/lib/finance-display-settings'

export async function GET() {
  const rate = await loadKesPerUsdRate()
  return NextResponse.json({
    base: 'USD',
    rates: { USD: 1, KES: rate },
    provider: 'platform',
  })
}
