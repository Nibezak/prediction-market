/* eslint-disable style/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { after, NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { createPaymentIntent, processPaymentJobs } from '@/lib/payments/lifecycle'
import { createRampDeposit } from '@/lib/ramp'
import { getAccountRestriction } from '@/lib/risk/account-restrictions'
import { screenUserForSanctions } from '@/lib/risk/sanctions'
import { enforceRateLimit } from '@/lib/security/rate-limit'

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
    if (!session?.user?.id) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    await assertOperationEnabled('deposits')
    await enforceRateLimit({ scope: 'deposit-initiate', identifier: session.user.id, limit: 10, windowSeconds: 60 })
    const restriction = await getAccountRestriction(session.user.id)
    if (restriction.restricted) { return NextResponse.json({ error: restriction.reason }, { status: 423 }) }
    const screening = await screenUserForSanctions(session.user.id)
    if (screening.status === 'possible_match') { return NextResponse.json({ error: 'This account requires a compliance review before money movement can continue.' }, { status: 423 }) }
    const body = await request.json()
    const deposit = createRampDeposit({
      fiatCurrency: 'KES',
      fiatAmount: String(body?.fiatAmount ?? ''),
      cryptoCurrency: 'USDC',
      phoneNumber: String(body?.phoneNumber ?? ''),
      walletAddress: typeof body?.walletAddress === 'string' ? body.walletAddress : null,
    })
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() || randomUUID()
    const intent = await createPaymentIntent({
      userId: session.user.id,
      direction: 'deposit',
      sourceCurrency: deposit.fiatCurrency,
      destinationCurrency: deposit.cryptoCurrency,
      grossAmount: deposit.fiatAmount,
      providerFee: deposit.feeFiat,
      netAmount: deposit.cryptoAmount,
      idempotencyKey: `deposit:${session.user.id}:${idempotencyKey}`,
      metadata: { phoneNumber: deposit.phoneNumber, quotedRate: deposit.exchangeRate, settlementChain: deposit.settlementChain },
    })
    await recordAuditEvent({ eventType: 'money.deposit.requested', category: 'money', action: 'Deposit requested', actorUserId: session.user.id, subjectUserId: session.user.id, entityType: 'payment_intent', entityId: intent.id, idempotencyKey, metadata: { fiatAmount: deposit.fiatAmount, fiatCurrency: deposit.fiatCurrency, netAmount: deposit.cryptoAmount }, ...requestAuditContext(request.headers) })
    after(() => processPaymentJobs(`after-response-${intent.id}`, 1))
    return NextResponse.json({ ...deposit, depositId: intent.id, status: intent.status }, { status: 202 })
  }
  catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to start deposit.' },
      { status: (error as any)?.status || 400, headers: (error as any)?.retryAfter ? { 'retry-after': String((error as any).retryAfter) } : undefined },
    )
  }
}
