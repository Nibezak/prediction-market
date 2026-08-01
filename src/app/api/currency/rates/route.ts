import { NextResponse } from 'next/server'
import { quoteMinisendOnramp } from '@/lib/minisend'

const FALLBACK_KES_PER_USDC = 129.5

export async function GET() {
  try {
    const quote = await quoteMinisendOnramp({ amountUsdc: 1 })
    return NextResponse.json({
      base: 'USD',
      rates: { USD: 1, KES: quote.rate },
      provider: 'minisend',
      expiresAt: quote.expires_at,
    })
  }
  catch {
    return NextResponse.json({
      base: 'USD',
      rates: { USD: 1, KES: FALLBACK_KES_PER_USDC },
      provider: 'fallback',
    })
  }
}
