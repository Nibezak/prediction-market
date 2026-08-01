/* eslint-disable style/max-statements-per-line */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { recordAuditEvent } from '@/lib/audit'
import { jobs, notifications, payment_events, payment_intents, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { getSettlementAdapter } from '@/lib/settlement'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const FINAL_STATUSES = new Set(['succeeded', 'failed', 'expired', 'reversed', 'refunded', 'cancelled'])

type ClaimedPaymentJob = {
  id: string
  job_type: string
  payload: unknown
  attempts: number
  max_attempts: number
}

async function createMoneyNotification(values: typeof notifications.$inferInsert) {
  try {
    await db.insert(notifications).values(values)
  }
  catch (error) {
    console.error('Failed to create money notification', error)
  }
}

async function releaseWithdrawalReservation(paymentIntentId: string) {
  const [intent] = await db.select().from(payment_intents).where(eq(payment_intents.id, paymentIntentId)).limit(1)
  const withdrawalRequestId = typeof intent?.metadata?.withdrawalRequestId === 'string' ? intent.metadata.withdrawalRequestId : null
  if (!intent || !withdrawalRequestId) return null
  const secret = process.env.TELLWISE_SECRET?.trim() || ''
  if (!secret) throw new Error('Internal settlement authentication is not configured.')
  const baseUrl = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
  const url = `${baseUrl}/internal/users/${encodeURIComponent(intent.user_id)}/withdrawal-release`
  const body = JSON.stringify({ amount: String(intent.net_amount), requestId: withdrawalRequestId })
  const response = await fetch(url, {
    method: 'POST', cache: 'no-store',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: { 'content-type': 'application/json', 'x-tellwise-secret': secret, 'x-tellwise-internal-operation': 'withdrawal-release' } }),
    body,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || 'Could not release reserved withdrawal funds.')
  await db.update(withdrawal_requests).set({ status: 'failed', review_note: 'Reserved funds returned after settlement failure.' }).where(eq(withdrawal_requests.id, withdrawalRequestId))
  return payload?.data?.transactionId as string | undefined
}

export async function createPaymentIntent(input: {
  userId: string
  direction: 'deposit' | 'withdrawal' | 'refund' | 'adjustment'
  sourceCurrency: string
  destinationCurrency: string
  grossAmount: string
  providerFee?: string
  platformFee?: string
  netAmount: string
  idempotencyKey: string
  metadata?: Record<string, unknown>
  enqueueSettlement?: boolean
  settlementAdapter?: string
}) {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(payment_intents).where(eq(payment_intents.idempotency_key, input.idempotencyKey)).limit(1)
    if (existing) { return existing }
    const [intent] = await tx.insert(payment_intents).values({
      user_id: input.userId,
      direction: input.direction,
      status: 'pending',
      settlement_adapter: input.settlementAdapter || process.env.SETTLEMENT_ADAPTER || 'slimefish_backend',
      source_currency: input.sourceCurrency,
      destination_currency: input.destinationCurrency,
      gross_amount: input.grossAmount,
      provider_fee: input.providerFee || '0',
      platform_fee: input.platformFee || '0',
      net_amount: input.netAmount,
      idempotency_key: input.idempotencyKey,
      metadata: input.metadata || {},
    }).returning()
    await tx.insert(payment_events).values({ payment_intent_id: intent.id, event_type: 'payment.created', from_status: null, to_status: 'pending', actor_type: 'user', actor_id: input.userId })
    if (input.enqueueSettlement ?? true) {
      await tx.insert(jobs).values({ job_type: 'settlement.payment', dedupe_key: intent.id, payload: { paymentIntentId: intent.id }, max_attempts: 8 }).onConflictDoNothing()
    }
    return intent
  })
}

export async function transitionPaymentIntent(input: {
  id: string
  from: string[]
  to: string
  eventType: string
  actorType?: string
  actorId?: string
  patch?: Partial<typeof payment_intents.$inferInsert>
  payload?: Record<string, unknown>
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ status: payment_intents.status }).from(payment_intents).where(and(eq(payment_intents.id, input.id), inArray(payment_intents.status, input.from))).limit(1).for('update')
    if (!current) { return null }
    const [updated] = await tx.update(payment_intents).set({ ...input.patch, status: input.to, updated_at: new Date(), ...(FINAL_STATUSES.has(input.to) ? { completed_at: new Date() } : {}) }).where(and(eq(payment_intents.id, input.id), eq(payment_intents.status, current.status))).returning()
    if (!updated) { return null }
    await tx.insert(payment_events).values({ payment_intent_id: input.id, event_type: input.eventType, from_status: current.status, to_status: input.to, actor_type: input.actorType || 'system', actor_id: input.actorId, payload: input.payload || {} })
    return updated
  })
}

export async function processPaymentIntent(paymentIntentId: string) {
  await assertOperationEnabled('settlement')
  const [intent] = await db.select().from(payment_intents).where(eq(payment_intents.id, paymentIntentId)).limit(1)
  if (!intent || FINAL_STATUSES.has(intent.status)) { return intent || null }
  const processing = await transitionPaymentIntent({ id: intent.id, from: ['pending', 'created'], to: 'processing', eventType: 'payment.processing' })
  if (!processing && intent.status !== 'processing') { return null }
  const adapter = getSettlementAdapter()
  const result = await adapter.settle({ paymentIntentId: intent.id, userId: intent.user_id, direction: intent.direction as any, amount: String(intent.net_amount), currency: intent.destination_currency, metadata: intent.metadata })
  if (result.status === 'succeeded') {
    const completed = await transitionPaymentIntent({ id: intent.id, from: ['processing'], to: 'succeeded', eventType: 'payment.succeeded', patch: { external_reference: result.externalReference, ledger_transaction_id: result.ledgerTransactionId } })
    const withdrawalRequestId = typeof intent.metadata?.withdrawalRequestId === 'string' ? intent.metadata.withdrawalRequestId : null
    if (withdrawalRequestId) { await db.update(withdrawal_requests).set({ status: 'completed', external_reference: result.externalReference, completed_at: new Date() }).where(eq(withdrawal_requests.id, withdrawalRequestId)) }
    await createMoneyNotification({
      user_id: intent.user_id,
      category: 'money',
      title: intent.direction === 'deposit' ? `Deposit completed: $${Number(intent.net_amount).toFixed(2)}` : `Withdrawal completed: $${Number(intent.net_amount).toFixed(2)}`,
      description: intent.direction === 'deposit' ? 'Your funds are available to trade.' : 'Your withdrawal has been completed.',
      metadata: { paymentIntentId: intent.id, direction: intent.direction, amount: String(intent.net_amount) },
      link_type: 'internal',
      link_target: 'portfolio',
      link_url: '/portfolio?tab=transactions',
      link_label: 'View activity',
    })
    await recordAuditEvent({ eventType: intent.direction === 'deposit' ? 'money.deposit.completed' : 'money.withdrawal.completed', category: 'money', action: `${intent.direction} settlement completed`, actorUserId: intent.user_id, subjectUserId: intent.user_id, entityType: 'payment_intent', entityId: intent.id, metadata: { amount: String(intent.net_amount), currency: intent.destination_currency, adapter: intent.settlement_adapter, ledgerTransactionId: result.ledgerTransactionId } })
    return completed
  }
  if (result.status === 'pending') { return transitionPaymentIntent({ id: intent.id, from: ['processing'], to: 'pending', eventType: 'payment.provider_pending', patch: { external_reference: result.externalReference } }) }
  throw new Error(result.failureMessage || result.failureCode || 'Settlement failed')
}

export async function processPaymentJobs(workerId = `worker-${process.pid}`, limit = 10) {
  const claimed = await db.execute(sql<{ id: string, job_type: string, payload: { paymentIntentId?: string }, attempts: number, max_attempts: number }>`
    UPDATE jobs SET status = 'processing', reserved_at = now(), attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM jobs WHERE job_type IN ('settlement.payment','settlement.compensate') AND status IN ('pending','retry') AND available_at <= now()
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
    ) RETURNING id, job_type, payload, attempts, max_attempts
  `)
  const claimedJobs = Array.from(claimed) as unknown as ClaimedPaymentJob[]
  const results = []
  for (const job of claimedJobs) {
    const payload = job.payload as { paymentIntentId?: unknown }
    const paymentIntentId = typeof payload?.paymentIntentId === 'string' ? payload.paymentIntentId : null
    try {
      if (!paymentIntentId) { throw new Error('Payment job is missing paymentIntentId') }
      if (job.job_type === 'settlement.compensate') await releaseWithdrawalReservation(paymentIntentId)
      else await processPaymentIntent(paymentIntentId)
      await db.update(jobs).set({ status: 'completed', last_error: null, updated_at: new Date() }).where(eq(jobs.id, job.id))
      results.push({ id: job.id, status: 'completed' })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Payment processing failed'
      if (paymentIntentId && job.attempts >= job.max_attempts) {
        const failed = await transitionPaymentIntent({ id: paymentIntentId, from: ['processing', 'pending'], to: 'failed', eventType: 'payment.failed', patch: { failure_code: 'RETRIES_EXHAUSTED', failure_message: message } })
        if (failed) {
          if (failed.direction === 'withdrawal') {
            await db.insert(jobs).values({ job_type: 'settlement.compensate', dedupe_key: `compensate:${failed.id}`, payload: { paymentIntentId: failed.id }, max_attempts: 12 }).onConflictDoNothing()
          }
          await createMoneyNotification({ user_id: failed.user_id, category: 'money', title: `${failed.direction === 'deposit' ? 'Deposit' : 'Withdrawal'} could not be completed`, description: 'No funds were lost. Please review the transaction or contact support.', metadata: { paymentIntentId: failed.id, reason: message }, link_type: 'internal', link_target: 'portfolio', link_url: '/portfolio?tab=transactions', link_label: 'View transaction' })
          await recordAuditEvent({ eventType: failed.direction === 'deposit' ? 'money.deposit.failed' : 'money.withdrawal.failed', category: 'money', action: `${failed.direction} settlement failed`, outcome: 'failure', severity: 'high', actorUserId: failed.user_id, subjectUserId: failed.user_id, entityType: 'payment_intent', entityId: failed.id, metadata: { reason: message } })
        }
      }
      await db.execute(sql`UPDATE jobs SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'retry' END, last_error = ${message}, available_at = now() + (LEAST(attempts, 8) * interval '30 seconds'), reserved_at = NULL, updated_at = now() WHERE id = ${job.id}`)
      results.push({ id: job.id, status: 'retry', error: message })
    }
  }
  return { workerId, claimed: claimedJobs.length, results }
}
