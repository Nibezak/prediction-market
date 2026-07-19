import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createKotaniOnramp, getKotaniOnrampRate } from '@/lib/kotanipay'
import { auth } from '@/lib/auth'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'

function normalizeKenyanPhoneNumber(value: unknown) {
  const phone = typeof value === 'string' ? value.replace(/\s+/g, '') : ''
  if (/^254\d{9}$/.test(phone)) {
    return phone
  }
  if (/^0\d{9}$/.test(phone)) {
    return `254${phone.slice(1)}`
  }
  if (/^\+254\d{9}$/.test(phone)) {
    return phone.slice(1)
  }
  return null
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    const phoneNumber = normalizeKenyanPhoneNumber(body?.phone)
    const fiatAmount = Number.parseFloat(String(body?.amount ?? ''))
    const walletAddress = typeof body?.walletAddress === 'string' ? body.walletAddress.trim() : ''

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Enter a valid Kenyan phone number (254712345678).' }, { status: 400 })
    }

    if (!Number.isFinite(fiatAmount) || fiatAmount < 100) {
      return NextResponse.json({ error: 'Minimum deposit is KES 100.' }, { status: 400 })
    }

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required.' }, { status: 400 })
    }

    const rate = await getKotaniOnrampRate({
      fiatAmount,
      fiatCurrency: 'KES',
      cryptoCurrency: 'USDC',
    })

    const onramp = await createKotaniOnramp({
      phoneNumber,
      fiatAmount,
      walletAddress,
      rateId: rate.id,
      referenceId: randomUUID(),
      fiatCurrency: 'KES',
      cryptoCurrency: 'USDC',
    })

    await recordAuditEvent({ eventType: 'money.deposit.requested', category: 'money', action: 'Requested M-Pesa deposit', outcome: 'pending', actorUserId: session.user.id, subjectUserId: session.user.id, entityType: 'deposit', entityId: onramp.referenceId, metadata: { fiatAmount, fiatCurrency: 'KES', cryptoCurrency: 'USDC', cryptoAmount: rate.cryptoAmount, phone: `${phoneNumber.slice(0, 5)}****${phoneNumber.slice(-2)}` }, ...requestAuditContext(request.headers) })

    return NextResponse.json({
      referenceId: onramp.referenceId,
      status: 'PENDING',
      fiatAmount,
      cryptoAmount: rate.cryptoAmount,
      fiatCurrency: 'KES',
      cryptoCurrency: 'USDC',
      rate: Number.parseFloat(rate.value),
      message: onramp.message,
      expiresAt: null,
    })
  }
  catch (error) {
    console.error('[Kotani Pay] Onramp failed:', error)
    await recordAuditEvent({ eventType: 'money.deposit.failed', category: 'money', action: 'M-Pesa deposit request failed', outcome: 'failure', severity: 'warning', actorUserId: session.user.id, subjectUserId: session.user.id, metadata: { reason: error instanceof Error ? error.message : 'Unknown provider error' }, ...requestAuditContext(request.headers) })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate M-Pesa deposit.' },
      { status: 400 },
    )
  }
}
