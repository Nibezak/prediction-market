import { eq, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { notifications, payment_intents, provider_webhook_events, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { verifyMinisendWebhook } from '@/lib/minisend'
import { transitionPaymentIntent } from '@/lib/payments/lifecycle'
import { ledgerOperation } from '@/lib/payments/provider-webhook'

type MinisendWebhookPayload = Record<string, unknown>

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function numberString(value: unknown, fallback: string) {
  const numeric = Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : fallback
}

function getEventType(payload: MinisendWebhookPayload) {
  return stringValue(payload.type) || stringValue(payload.event) || ''
}

function getProviderEventId(payload: MinisendWebhookPayload, eventType: string) {
  return stringValue(payload.id)
    || stringValue(payload.event_id)
    || stringValue(payload.release_tx_hash)
    || stringValue(payload.deposit_tx_hash)
    || stringValue(payload.order_id)
    || stringValue(payload.session_id)
    || `${eventType}:${stringValue(payload.external_reference) || stringValue(payload.external_id) || 'unknown'}`
}

async function findIntent(payload: MinisendWebhookPayload) {
  const intentReference = stringValue(payload.external_reference) || stringValue(payload.external_id) || stringValue(payload.reference)
  const providerReference = stringValue(payload.order_id) || stringValue(payload.session_id)
  if (!intentReference && !providerReference) {
    return null
  }
  const [intent] = await db.select().from(payment_intents).where(or(
    ...(intentReference ? [eq(payment_intents.id, intentReference)] : []),
    ...(providerReference ? [eq(payment_intents.external_reference, providerReference)] : []),
  )).limit(1)
  return intent || null
}

async function notifyMoneyCompleted(intent: typeof payment_intents.$inferSelect) {
  try {
    await db.insert(notifications).values({
      user_id: intent.user_id,
      category: 'money',
      title: intent.direction === 'deposit' ? `Deposit completed: $${Number(intent.net_amount).toFixed(2)}` : `Withdrawal completed: $${Number(intent.net_amount).toFixed(2)}`,
      description: intent.direction === 'deposit' ? 'Your funds are available to trade.' : 'Your payout has been completed.',
      metadata: { paymentIntentId: intent.id, direction: intent.direction, amount: String(intent.net_amount), provider: 'minisend' },
      link_type: 'internal',
      link_target: 'portfolio',
      link_url: '/portfolio?tab=transactions',
      link_label: 'View activity',
    })
  }
  catch (error) {
    console.error('Failed to create Minisend money notification', error)
  }
}

async function failIntent(intent: typeof payment_intents.$inferSelect, eventType: string, payload: MinisendWebhookPayload) {
  const withdrawalRequestId = typeof intent.metadata?.withdrawalRequestId === 'string' ? intent.metadata.withdrawalRequestId : null
  if (intent.direction === 'withdrawal' && withdrawalRequestId) {
    await ledgerOperation({ userId: intent.user_id, amount: String(intent.net_amount), operationId: withdrawalRequestId, operation: 'withdrawal-release' })
    await db.update(withdrawal_requests).set({ status: 'failed', review_note: 'Minisend payout failed; reserved funds were returned.' }).where(eq(withdrawal_requests.id, withdrawalRequestId))
  }
  await transitionPaymentIntent({
    id: intent.id,
    from: ['created', 'pending', 'processing'],
    to: eventType.endsWith('.expired') ? 'expired' : 'failed',
    eventType,
    actorType: 'provider',
    actorId: 'minisend',
    patch: { failure_message: stringValue(payload.error) || stringValue(payload.reason) || 'Minisend reported failure.' },
    payload,
  })
}

async function completeIntent(intent: typeof payment_intents.$inferSelect, eventType: string, providerEventId: string, payload: MinisendWebhookPayload) {
  let ledgerTransactionId = intent.ledger_transaction_id || undefined
  if (intent.direction === 'deposit' && !ledgerTransactionId) {
    ledgerTransactionId = await ledgerOperation({
      userId: intent.user_id,
      amount: numberString(payload.amount_usdc, String(intent.net_amount)),
      operationId: intent.id,
      operation: 'settlement-credit',
    })
  }

  const withdrawalRequestId = typeof intent.metadata?.withdrawalRequestId === 'string' ? intent.metadata.withdrawalRequestId : null
  if (intent.direction === 'withdrawal' && withdrawalRequestId) {
    await db.update(withdrawal_requests).set({
      status: 'completed',
      external_reference: stringValue(payload.order_id) || stringValue(payload.session_id) || providerEventId,
      completed_at: new Date(),
    }).where(eq(withdrawal_requests.id, withdrawalRequestId))
  }

  const completed = await transitionPaymentIntent({
    id: intent.id,
    from: ['created', 'pending', 'processing'],
    to: 'succeeded',
    eventType,
    actorType: 'provider',
    actorId: 'minisend',
    patch: {
      external_reference: stringValue(payload.order_id) || stringValue(payload.session_id) || intent.external_reference,
      ledger_transaction_id: ledgerTransactionId,
      metadata: { ...(intent.metadata || {}), lastMinisendEvent: payload },
    },
    payload: { providerEventId },
  })
  if (completed) {
    await notifyMoneyCompleted(completed)
  }
}

async function processMinisendEvent(payload: MinisendWebhookPayload, eventType: string, providerEventId: string) {
  const intent = await findIntent(payload)
  if (!intent) {
    throw new Error('Payment intent not found for Minisend webhook.')
  }

  if (eventType === 'onramp.completed') {
    await transitionPaymentIntent({
      id: intent.id,
      from: ['created', 'pending'],
      to: 'processing',
      eventType,
      actorType: 'provider',
      actorId: 'minisend',
      patch: { metadata: { ...(intent.metadata || {}), onrampCompleted: payload } },
      payload: { providerEventId },
    })
    return
  }

  if (eventType === 'onramp.released' || eventType === 'checkout.completed' || eventType === 'offramp.completed') {
    await completeIntent(intent, eventType, providerEventId, payload)
    return
  }

  if (eventType.endsWith('.failed') || eventType.endsWith('.expired')) {
    await failIntent(intent, eventType, payload)
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-minisend-signature') || ''
  try {
    const verification = verifyMinisendWebhook(rawBody, signature)
    const payload = JSON.parse(rawBody) as MinisendWebhookPayload
    const eventType = getEventType(payload)
    const providerEventId = getProviderEventId(payload, eventType)
    const inserted = await db.insert(provider_webhook_events).values({
      provider: 'minisend',
      provider_event_id: providerEventId,
      event_type: eventType || 'unknown',
      payment_intent_id: stringValue(payload.external_reference) || stringValue(payload.external_id),
      payload_hash: verification.payloadHash,
      signature_digest: verification.signatureDigest,
    }).onConflictDoNothing().returning({ id: provider_webhook_events.id })

    if (!inserted[0]) {
      return NextResponse.json({ replayed: true })
    }

    try {
      await processMinisendEvent(payload, eventType, providerEventId)
      await db.update(provider_webhook_events).set({ status: 'processed', processed_at: new Date() }).where(eq(provider_webhook_events.id, inserted[0].id))
      return NextResponse.json({ processed: true })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Minisend webhook processing failed.'
      await db.update(provider_webhook_events).set({ status: 'failed', failure_message: message.slice(0, 1000), processed_at: new Date() }).where(eq(provider_webhook_events.id, inserted[0].id))
      throw error
    }
  }
  catch (error) {
    console.error('Minisend webhook rejected', error)
    return NextResponse.json({ error: 'Invalid Minisend webhook.' }, { status: 400 })
  }
}
