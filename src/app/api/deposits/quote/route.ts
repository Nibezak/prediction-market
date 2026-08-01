import { NextResponse } from 'next/server'
import { quoteMinisendOnramp } from '@/lib/minisend'
import { enforceRateLimit } from '@/lib/security/rate-limit'

const FALLBACK_KES_PER_USDC = Number.parseFloat(process.env.TELLWISE_KES_PER_USDC || '') || 129.5

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
    await enforceRateLimit({ scope: 'deposit-quote', identifier: ip, limit: 60, windowSeconds: 60 })
    const body = await request.json()
    const fiatAmount = Number(body?.fiatAmount)
    if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) {
      return NextResponse.json({ error: 'Enter a valid KES amount.' }, { status: 400 })
    }
    const quote = await quoteMinisendOnramp({ amountKes: fiatAmount }).catch(() => null)
    if (!quote) {
      const cryptoAmount = fiatAmount / FALLBACK_KES_PER_USDC
      return NextResponse.json({
        fiatCurrency: 'KES',
        fiatAmount: fiatAmount.toFixed(2),
        cryptoCurrency: 'USDC',
        cryptoAmount: cryptoAmount.toFixed(2),
        exchangeRate: String(FALLBACK_KES_PER_USDC),
        feeFiat: '0',
        provider: 'minisend',
        settlementChain: 'base',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })
    }
    return NextResponse.json({
      fiatCurrency: 'KES',
      fiatAmount: String(quote.amount_kes),
      cryptoCurrency: 'USDC',
      cryptoAmount: String(quote.amount_usdc),
      exchangeRate: String(quote.rate),
      feeFiat: String(quote.fee_kes),
      provider: 'minisend',
      settlementChain: 'base',
      expiresAt: quote.expires_at,
    })
  }
  catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to quote deposit.' },
      { status: (error as any)?.status || 400, headers: (error as any)?.retryAfter ? { 'retry-after': String((error as any).retryAfter) } : undefined },
    )
  }
}
