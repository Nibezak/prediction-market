/* eslint-disable style/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { payment_intents } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'
import { createMinisendOnrampOrder, quoteMinisendOnramp } from '@/lib/minisend'
import { MAX_MPESA_DEPOSIT_KES, MIN_MPESA_DEPOSIT_KES } from '@/lib/mpesa-money'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { createPaymentIntent, transitionPaymentIntent } from '@/lib/payments/lifecycle'
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
    const idempotencyKey = request.headers.get('idempotency-key')?.trim() || randomUUID()

    const fiatAmount = Number(body?.fiatAmount)
    const phoneNumber = normalizeKenyanPhone(String(body?.phoneNumber ?? ''))
    if (!Number.isFinite(fiatAmount) || !phoneNumber) {
      return NextResponse.json({ error: 'Enter a valid KES amount and M-Pesa phone number.' }, { status: 400 })
    }
    if (fiatAmount < MIN_MPESA_DEPOSIT_KES || fiatAmount > MAX_MPESA_DEPOSIT_KES) {
      return NextResponse.json({ error: `Deposit must be between KES ${MIN_MPESA_DEPOSIT_KES.toLocaleString('en-US')} and KES ${MAX_MPESA_DEPOSIT_KES.toLocaleString('en-US')}.` }, { status: 400 })
    }
    const quote = await quoteMinisendOnramp({ amountKes: fiatAmount })
    const intent = await createPaymentIntent({
      userId: session.user.id,
      direction: 'deposit',
      sourceCurrency: 'KES',
      destinationCurrency: 'USDC',
      grossAmount: String(quote.amount_kes),
      providerFee: String(quote.fee_kes),
      netAmount: String(quote.amount_usdc),
      idempotencyKey: `deposit:onramp:${session.user.id}:${idempotencyKey}`,
      settlementAdapter: 'minisend',
      enqueueSettlement: false,
      metadata: { provider: 'minisend', method: 'onramp', phoneNumber, quotedRate: quote.rate, settlementChain: 'base', quote },
    })
    try {
      const order = await createMinisendOnrampOrder({
        amountKes: fiatAmount,
        phone: phoneNumber,
        reference: intent.id,
        idempotencyKey: `minisend:onramp:${intent.id}`,
      })
      await db.update(payment_intents).set({
        external_reference: order.order_id,
        metadata: { ...(intent.metadata || {}), order },
        updated_at: new Date(),
      }).where(eq(payment_intents.id, intent.id))
      await recordAuditEvent({ eventType: 'money.deposit.requested', category: 'money', action: 'Minisend M-Pesa deposit requested', actorUserId: session.user.id, subjectUserId: session.user.id, entityType: 'payment_intent', entityId: intent.id, idempotencyKey, metadata: { fiatAmount: quote.amount_kes, fiatCurrency: 'KES', netAmount: quote.amount_usdc, orderId: order.order_id }, ...requestAuditContext(request.headers) })
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
        depositId: intent.id,
        orderId: order.order_id,
        status: 'PENDING_STK',
        phoneNumber,
        message: order.instructions || 'M-Pesa prompt sent.',
      }, { status: 202 })
    }
    catch (error) {
      await transitionPaymentIntent({ id: intent.id, from: ['pending'], to: 'failed', eventType: 'payment.failed', actorType: 'provider', actorId: 'minisend', patch: { failure_message: error instanceof Error ? error.message : 'Minisend order creation failed.' } })
      throw error
    }
  }
  catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Unable to start deposit.'
    const message = /not authorized|missing scope/i.test(rawMessage)
      ? 'Minisend is not authorized for M-Pesa deposits yet. Check the configured API key scopes.'
      : /failed query|insert into|duplicate key|violates|syntax error|database/i.test(rawMessage)
        ? 'We could not start that deposit right now. Please try again.'
        : rawMessage
    return NextResponse.json(
      { error: message },
      { status: (error as any)?.status || 400, headers: (error as any)?.retryAfter ? { 'retry-after': String((error as any).retryAfter) } : undefined },
    )
  }
}
