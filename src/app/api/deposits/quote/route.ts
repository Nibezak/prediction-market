import { NextResponse } from 'next/server'
import { createRampQuote } from '@/lib/ramp'
import { enforceRateLimit } from '@/lib/security/rate-limit'

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
    await enforceRateLimit({ scope: 'deposit-quote', identifier: ip, limit: 60, windowSeconds: 60 })
    const body = await request.json()
    const quote = createRampQuote({
      fiatCurrency: 'KES',
      fiatAmount: String(body?.fiatAmount ?? ''),
      cryptoCurrency: 'USDC',
    })
    return NextResponse.json(quote)
  }
  catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to quote deposit.' },
      { status: (error as any)?.status || 400, headers: (error as any)?.retryAfter ? { 'retry-after': String((error as any).retryAfter) } : undefined },
    )
  }
}
