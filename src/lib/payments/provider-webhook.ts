import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { payment_disputes, payment_intents, provider_webhook_events } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { transitionPaymentIntent } from '@/lib/payments/lifecycle'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const MAX_CLOCK_SKEW_SECONDS = 300
const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

type ProviderPayload = {
  id?: unknown
  type?: unknown
  paymentIntentId?: unknown
  externalReference?: unknown
  disputeId?: unknown
  amount?: unknown
  reason?: unknown
  evidence?: unknown
}

function providerSecret(provider: string) {
  const suffix = provider.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return process.env[`PAYMENT_WEBHOOK_SECRET_${suffix}`]?.trim()
    || process.env.PAYMENT_PROVIDER_WEBHOOK_SECRET?.trim()
    || ''
}

function normalizeSignature(value: string) {
  return value.trim().replace(/^sha256=/i, '').toLowerCase()
}

export function verifyProviderWebhook(input: { provider: string, rawBody: string, timestamp: string, signature: string }) {
  const secret = providerSecret(input.provider)
  if (!secret) throw new Error('Provider webhook verification is not configured.')
  const timestamp = Number(input.timestamp)
  if (!Number.isFinite(timestamp) || Math.abs(Math.floor(Date.now() / 1000) - timestamp) > MAX_CLOCK_SKEW_SECONDS) {
    throw new Error('Webhook timestamp is outside the accepted window.')
  }
  const supplied = normalizeSignature(input.signature)
  const expected = createHmac('sha256', secret).update(`${input.timestamp}.${input.rawBody}`).digest('hex')
  const suppliedBuffer = Buffer.from(supplied, 'hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error('Webhook signature is invalid.')
  }
  return {
    payloadHash: createHash('sha256').update(input.rawBody).digest('hex'),
    signatureDigest: createHash('sha256').update(supplied).digest('hex'),
  }
}

export async function ledgerOperation(input: { userId: string, amount: string, operationId: string, operation: 'settlement-credit' | 'settlement-debit' | 'withdrawal-release' }) {
  const secret = process.env.TELLWISE_SECRET?.trim() || ''
  if (!secret) throw new Error('Internal settlement authentication is not configured.')
  const endpoint = input.operation === 'withdrawal-release' ? 'withdrawal-release' : input.operation
  const body = input.operation === 'withdrawal-release'
    ? { amount: input.amount, requestId: input.operationId }
    : { amount: input.amount, operationId: input.operationId, paymentIntentId: input.operationId }
  const url = `${AMM_BASE_URL}/internal/users/${encodeURIComponent(input.userId)}/${endpoint}`
  const requestBody = JSON.stringify(body)
  const response = await fetch(url, {
    method: 'POST',
    cache: 'no-store',
    headers: signSlimefishBackendRequest({
      url,
      method: 'POST',
      body: requestBody,
      headers: {
      'content-type': 'application/json',
      'x-tellwise-secret': secret,
      'x-tellwise-internal-operation': input.operation,
      },
    }),
    body: requestBody,
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || `Ledger ${input.operation} failed.`)
  return result?.data?.transactionId as string | undefined
}

export async function acceptProviderWebhook(provider: string, providerEventId: string, payload: ProviderPayload, verification: { payloadHash: string, signatureDigest: string }) {
  const eventType = typeof payload.type === 'string' ? payload.type : ''
  const paymentIntentId = typeof payload.paymentIntentId === 'string' ? payload.paymentIntentId : null
  const inserted = await db.insert(provider_webhook_events).values({
    provider,
    provider_event_id: providerEventId,
    event_type: eventType || 'unknown',
    payment_intent_id: paymentIntentId,
    payload_hash: verification.payloadHash,
    signature_digest: verification.signatureDigest,
  }).onConflictDoNothing().returning({ id: provider_webhook_events.id })
  if (!inserted[0]) return { replayed: true }

  try {
    if (!paymentIntentId) throw new Error('Webhook is missing paymentIntentId.')
    const [intent] = await db.select().from(payment_intents).where(eq(payment_intents.id, paymentIntentId)).limit(1)
    if (!intent) throw new Error('Payment intent not found.')

    if (eventType === 'payment.succeeded') {
      const ledgerTransactionId = intent.direction === 'withdrawal'
        ? intent.ledger_transaction_id || undefined
        : await ledgerOperation({ userId: intent.user_id, amount: String(intent.net_amount), operationId: intent.id, operation: 'settlement-credit' })
      await transitionPaymentIntent({ id: intent.id, from: ['created', 'pending', 'processing'], to: 'succeeded', eventType, actorType: 'provider', actorId: provider, patch: { external_reference: String(payload.externalReference || providerEventId), ledger_transaction_id: ledgerTransactionId }, payload: { providerEventId } })
    }
    else if (eventType === 'payment.failed') {
      await transitionPaymentIntent({ id: intent.id, from: ['created', 'pending', 'processing'], to: 'failed', eventType, actorType: 'provider', actorId: provider, patch: { external_reference: String(payload.externalReference || ''), failure_message: String(payload.reason || 'Provider reported failure') } })
    }
    else if (eventType === 'payment.reversed') {
      const operation = intent.direction === 'withdrawal' ? 'withdrawal-release' : 'settlement-debit'
      const ledgerTransactionId = await ledgerOperation({ userId: intent.user_id, amount: String(intent.net_amount), operationId: providerEventId, operation })
      await transitionPaymentIntent({ id: intent.id, from: ['succeeded', 'held'], to: 'reversed', eventType, actorType: 'provider', actorId: provider, patch: { ledger_transaction_id: ledgerTransactionId || intent.ledger_transaction_id }, payload: { providerEventId } })
    }
    else if (eventType === 'payment.refunded') {
      const ledgerTransactionId = await ledgerOperation({ userId: intent.user_id, amount: String(payload.amount || intent.net_amount), operationId: providerEventId, operation: 'settlement-credit' })
      await transitionPaymentIntent({ id: intent.id, from: ['succeeded', 'held'], to: 'refunded', eventType, actorType: 'provider', actorId: provider, payload: { providerEventId, ledgerTransactionId } })
    }
    else if (eventType === 'dispute.opened') {
      const disputeId = typeof payload.disputeId === 'string' ? payload.disputeId : providerEventId
      await db.insert(payment_disputes).values({ payment_intent_id: intent.id, provider, provider_dispute_id: disputeId, amount: String(payload.amount || intent.net_amount), reason: typeof payload.reason === 'string' ? payload.reason : null, evidence: typeof payload.evidence === 'object' && payload.evidence ? payload.evidence as Record<string, unknown> : {} }).onConflictDoNothing()
      await transitionPaymentIntent({ id: intent.id, from: ['succeeded'], to: 'held', eventType, actorType: 'provider', actorId: provider, payload: { disputeId } })
    }
    else if (eventType === 'dispute.won' || eventType === 'dispute.lost' || eventType === 'dispute.cancelled') {
      const disputeId = typeof payload.disputeId === 'string' ? payload.disputeId : providerEventId
      const status = eventType.split('.')[1]
      await db.update(payment_disputes).set({ status, updated_at: new Date(), closed_at: new Date() }).where(and(eq(payment_disputes.provider, provider), eq(payment_disputes.provider_dispute_id, disputeId)))
      let ledgerTransactionId: string | undefined
      if (status === 'lost') ledgerTransactionId = await ledgerOperation({ userId: intent.user_id, amount: String(payload.amount || intent.net_amount), operationId: providerEventId, operation: 'settlement-debit' })
      await transitionPaymentIntent({ id: intent.id, from: ['held'], to: status === 'won' || status === 'cancelled' ? 'succeeded' : 'reversed', eventType, actorType: 'provider', actorId: provider, payload: { disputeId, ledgerTransactionId } })
    }
    else {
      await db.update(provider_webhook_events).set({ status: 'ignored', processed_at: new Date() }).where(eq(provider_webhook_events.id, inserted[0].id))
      return { replayed: false, ignored: true }
    }

    await db.update(provider_webhook_events).set({ status: 'processed', processed_at: new Date() }).where(eq(provider_webhook_events.id, inserted[0].id))
    return { replayed: false, processed: true }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.'
    await db.update(provider_webhook_events).set({ status: 'failed', failure_message: message.slice(0, 1000), processed_at: new Date() }).where(eq(provider_webhook_events.id, inserted[0].id))
    throw error
  }
}
