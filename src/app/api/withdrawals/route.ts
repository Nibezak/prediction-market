/* eslint-disable style/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { after, NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { createPaymentIntent, processPaymentJobs } from '@/lib/payments/lifecycle'
import { getAccountRestriction } from '@/lib/risk/account-restrictions'
import { screenUserForSanctions } from '@/lib/risk/sanctions'
import { createWithdrawalReview } from '@/lib/risk/withdrawal'
import { enforceRateLimit } from '@/lib/security/rate-limit'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

function serviceHeaders(extra?: Record<string, string>) {
  const secret = process.env.TELLWISE_SECRET?.trim() || ''
  return {
    'x-tellwise-secret': secret,
    'x-play-money-api-key': process.env.PLAY_MONEY_SERVICE_API_KEY?.trim() || secret,
    ...extra,
  }
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
  const body = await req.json().catch(() => null) as { amount?: unknown, destination?: unknown, idempotencyKey?: unknown } | null
  const amount = Number(body?.amount)
  const idempotencyKey = typeof body?.idempotencyKey === 'string' && body.idempotencyKey.length >= 12 ? body.idempotencyKey : randomUUID()
  try {
    const balanceResponse = await fetch(`${AMM_BASE_URL}/users/${encodeURIComponent(session.user.id)}/balance`, {
      headers: serviceHeaders({ 'x-tellwise-user-id': session.user.id }),
      cache: 'no-store',
    })
    const balancePayload = await balanceResponse.json().catch(() => null)
    const currentBalance = Number(balancePayload?.data?.balance?.total ?? balancePayload?.data?.balance ?? 0)
    const review = await createWithdrawalReview({
      userId: session.user.id,
      amount,
      currentBalance,
      destination: typeof body?.destination === 'string' ? body.destination.slice(0, 200) : undefined,
      idempotencyKey,
    })
    const reserveResponse = await fetch(`${AMM_BASE_URL}/internal/users/${encodeURIComponent(session.user.id)}/withdrawal-reserve`, {
      method: 'POST',
      headers: serviceHeaders({ 'Content-Type': 'application/json', 'x-tellwise-internal-operation': 'risk-reviewed-withdrawal-reserve', 'idempotency-key': `withdrawal-reserve:${review.request.id}` }),
      body: JSON.stringify({ amount, requestId: review.request.id }),
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
        sourceCurrency: 'USD',
        destinationCurrency: 'PLAY',
        grossAmount: amount.toFixed(2),
        netAmount: amount.toFixed(2),
        idempotencyKey: `withdrawal:${review.request.id}`,
        metadata: { withdrawalRequestId: review.request.id, destination: typeof body?.destination === 'string' ? body.destination.slice(0, 200) : null },
      })
      after(() => processPaymentJobs(`after-response-${intent.id}`, 1))
    }
    return NextResponse.json({ data: { id: review.request.id, status: review.request.status, riskDecision: review.evaluation.decision, message: review.request.status === 'held' ? 'Your withdrawal is under review.' : 'Your withdrawal was approved.' } }, { status: review.request.status === 'held' ? 202 : 201 })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Withdrawal request failed'
    await recordAuditEvent({ eventType: 'money.withdrawal.failed', category: 'money', action: 'Withdrawal request failed', outcome: 'failure', severity: 'warning', actorUserId: session.user.id, subjectUserId: session.user.id, metadata: { amount, reason: message }, ...requestAuditContext(req.headers) })
    return NextResponse.json({ error: message }, { status: /insufficient/i.test(message) ? 409 : 400 })
  }
}
