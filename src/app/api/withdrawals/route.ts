/* eslint-disable style/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { normalizeKenyanPhone } from '@/lib/kenyan-phone'
import { createMinisendOfframpOrder, quoteMinisendOfframp } from '@/lib/minisend'
import { MIN_MPESA_WITHDRAWAL_KES } from '@/lib/mpesa-money'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { createPaymentIntent, transitionPaymentIntent } from '@/lib/payments/lifecycle'
import { getAccountRestriction } from '@/lib/risk/account-restrictions'
import { screenUserForSanctions } from '@/lib/risk/sanctions'
import { createWithdrawalReview } from '@/lib/risk/withdrawal'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const DEFAULT_KES_PER_USDC = 129.5

function getKesPerUsdc() {
  const configuredRate = Number(process.env.MINISEND_KES_PER_USDC)
  return Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : DEFAULT_KES_PER_USDC
}

function serviceHeaders(input: { url: string, method?: string, body?: string | null, extra?: Record<string, string> }) {
  const secret = process.env.TELLWISE_SECRET?.trim() || ''
  return signSlimefishBackendRequest({
    url: input.url,
    method: input.method,
    body: input.body,
    headers: {
    'x-tellwise-secret': secret,
      ...input.extra,
    },
  })
}

export async function POST(req: Request) {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders }).catch(() => null)
  if (!session?.user?.id) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  try { await assertOperationEnabled('withdrawals') }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Withdrawals are unavailable' }, { status: 503 }) }
  await enforceRateLimit({ scope: 'withdrawal-initiate', identifier: session.user.id, limit: 6, windowSeconds: 60 })
  const restriction = await getAccountRestriction(session.user.id)
  if (restriction.restricted) { return NextResponse.json({ error: restriction.reason }, { status: 423 }) }
  const screening = await screenUserForSanctions(session.user.id)
  if (screening.status === 'possible_match') { return NextResponse.json({ error: 'This account requires a compliance review before money movement can continue.' }, { status: 423 }) }
  const body = await req.json().catch(() => null) as { amount?: unknown, amountCurrency?: unknown, destination?: unknown, idempotencyKey?: unknown, recipientName?: unknown, mobileNetwork?: unknown } | null
  const requestedAmount = Number(body?.amount)
  const amountCurrency = body?.amountCurrency === 'USDC' ? 'USDC' : 'KES'
  const destinationPhone = normalizeKenyanPhone(String(body?.destination ?? ''))
  if (!destinationPhone) {
    return NextResponse.json({ error: 'Enter a valid Kenyan M-Pesa phone number.' }, { status: 400 })
  }
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    return NextResponse.json({ error: 'Enter a valid withdrawal amount.' }, { status: 400 })
  }
  if (amountCurrency === 'KES' && requestedAmount < MIN_MPESA_WITHDRAWAL_KES) {
    return NextResponse.json({ error: `Withdrawal must be at least KES ${MIN_MPESA_WITHDRAWAL_KES.toLocaleString('en-US')}.` }, { status: 400 })
  }
  const idempotencyKey = typeof body?.idempotencyKey === 'string' && body.idempotencyKey.length >= 12 ? body.idempotencyKey : randomUUID()
  const recipient = {
    method: 'MOBILE',
    account_name: typeof body?.recipientName === 'string' && body.recipientName.trim()
      ? body.recipientName.trim().slice(0, 80)
      : session.user.name || session.user.email || 'Slimefish user',
    phone: destinationPhone,
    mobile_network: typeof body?.mobileNetwork === 'string' && body.mobileNetwork.trim() ? body.mobileNetwork.trim() : 'Safaricom',
  }
  let amount = amountCurrency === 'KES' ? requestedAmount / getKesPerUsdc() : requestedAmount
  let amountKes = amountCurrency === 'KES' ? requestedAmount : requestedAmount * getKesPerUsdc()
  let providerQuote: Awaited<ReturnType<typeof quoteMinisendOfframp>> | null = null
  try {
    providerQuote = await quoteMinisendOfframp({ amount, currency: 'KES', recipient }).catch(() => null)
    if (providerQuote?.amount_usdc && Number.isFinite(Number(providerQuote.amount_usdc))) {
      amount = Number(providerQuote.amount_usdc)
      amountKes = Number(providerQuote.recipient_amount || providerQuote.amount_local || amountKes)
    }
    const balanceUrl = `${AMM_BASE_URL}/users/${encodeURIComponent(session.user.id)}/balance`
    const balanceResponse = await fetch(balanceUrl, {
      headers: serviceHeaders({ url: balanceUrl, extra: { 'x-tellwise-user-id': session.user.id } }),
      cache: 'no-store',
    })
    const balancePayload = await balanceResponse.json().catch(() => null)
    const currentBalance = Number(balancePayload?.data?.balance?.total ?? balancePayload?.data?.balance ?? 0)
    const review = await createWithdrawalReview({
      userId: session.user.id,
      amount,
      currentBalance,
      destination: destinationPhone,
      idempotencyKey,
    })
    const reserveUrl = `${AMM_BASE_URL}/internal/users/${encodeURIComponent(session.user.id)}/withdrawal-reserve`
    const reserveBody = JSON.stringify({ amount, requestId: review.request.id })
    const reserveResponse = await fetch(reserveUrl, {
      method: 'POST',
      headers: serviceHeaders({ url: reserveUrl, method: 'POST', body: reserveBody, extra: { 'Content-Type': 'application/json', 'x-tellwise-internal-operation': 'risk-reviewed-withdrawal-reserve', 'idempotency-key': `withdrawal-reserve:${review.request.id}` } }),
      body: reserveBody,
    })
    const reservePayload = await reserveResponse.json().catch(() => null)
    if (!reserveResponse.ok) {
      await db.update(withdrawal_requests).set({ status: 'failed', review_note: reservePayload?.error || 'Ledger reservation failed' }).where(eq(withdrawal_requests.id, review.request.id))
      throw new Error(reservePayload?.error || 'Could not reserve withdrawal funds')
    }
    await db.update(withdrawal_requests).set({ ledger_transaction_id: reservePayload?.data?.transactionId }).where(eq(withdrawal_requests.id, review.request.id))
    if (review.request.status !== 'held') {
      const intent = await createPaymentIntent({
        userId: session.user.id,
        direction: 'withdrawal',
        sourceCurrency: 'USDC',
        destinationCurrency: 'KES',
        grossAmount: amount.toFixed(2),
        providerFee: providerQuote?.fee != null ? String(providerQuote.fee) : '0',
        netAmount: amount.toFixed(2),
        idempotencyKey: `withdrawal:${review.request.id}`,
        settlementAdapter: 'minisend',
        enqueueSettlement: false,
        metadata: { withdrawalRequestId: review.request.id, destination: destinationPhone, amountCurrency, requestedAmount, amountKes, quote: providerQuote },
      })
      try {
        const order = await createMinisendOfframpOrder({
          amount,
          currency: 'KES',
          recipient,
          reference: intent.id,
          idempotencyKey: `minisend:offramp:${intent.id}`,
        })
        await db.update(withdrawal_requests).set({
          status: 'pending_provider_funding',
          external_reference: order.order_id,
          review_note: 'Provider payout order created. Treasury must send exact Base USDC to the provider deposit address, then submit the transaction hash before M-Pesa payout starts.',
        }).where(eq(withdrawal_requests.id, review.request.id))
        await transitionPaymentIntent({
          id: intent.id,
          from: ['pending'],
          to: 'processing',
          eventType: 'offramp.order.created',
          actorType: 'provider',
          actorId: 'minisend',
          patch: {
            external_reference: order.order_id,
            metadata: {
              ...(intent.metadata || {}),
              order,
              providerFundingRequired: true,
              providerFundingStatus: 'pending',
              providerFundingInstruction: order.instructions,
            },
          },
          payload: { orderId: order.order_id },
        })
      }
      catch (error) {
        await transitionPaymentIntent({ id: intent.id, from: ['pending'], to: 'failed', eventType: 'offramp.order.failed', actorType: 'provider', actorId: 'minisend', patch: { failure_message: error instanceof Error ? error.message : 'Minisend off-ramp order creation failed.' } })
        const releaseUrl = `${AMM_BASE_URL}/internal/users/${encodeURIComponent(session.user.id)}/withdrawal-release`
        const releaseBody = JSON.stringify({ amount: amount.toFixed(2), requestId: review.request.id })
        await fetch(releaseUrl, {
          method: 'POST',
          headers: serviceHeaders({ url: releaseUrl, method: 'POST', body: releaseBody, extra: { 'Content-Type': 'application/json', 'x-tellwise-internal-operation': 'withdrawal-release' } }),
          body: releaseBody,
        }).catch(() => null)
        await db.update(withdrawal_requests).set({ status: 'failed', review_note: 'Minisend off-ramp order creation failed; reserved funds were returned.' }).where(eq(withdrawal_requests.id, review.request.id))
        throw error
      }
    }
    return NextResponse.json({
      data: {
        id: review.request.id,
        status: review.request.status === 'held' ? 'held' : 'pending_provider_funding',
        riskDecision: review.evaluation.decision,
        amountUsdc: amount,
        amountKes,
        message: review.request.status === 'held'
          ? 'Your withdrawal is under review.'
          : 'Withdrawal reserved. Payout will start after treasury funding is confirmed.',
      },
    }, { status: review.request.status === 'held' ? 202 : 201 })
  }
  catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Withdrawal request failed'
    const message = /not authorized|missing scope/i.test(rawMessage)
      ? 'Minisend is not authorized for this payout yet. Check the configured API key scopes.'
      : rawMessage
    await recordAuditEvent({ eventType: 'money.withdrawal.failed', category: 'money', action: 'Withdrawal request failed', outcome: 'failure', severity: 'warning', actorUserId: session.user.id, subjectUserId: session.user.id, metadata: { requestedAmount, amountCurrency, amount, reason: message }, ...requestAuditContext(req.headers) })
    return NextResponse.json({ error: message }, { status: /insufficient/i.test(message) ? 409 : 400 })
  }
}
