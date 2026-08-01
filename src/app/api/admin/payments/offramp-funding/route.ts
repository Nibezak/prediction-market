import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { UserRepository } from '@/lib/db/queries/user'
import { payment_events, payment_intents, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { submitMinisendOfframpDeposit } from '@/lib/minisend'
import { hasStaffPermission } from '@/lib/staff-permissions'

const BASE_TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/

export async function POST(request: Request) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !hasStaffPermission(currentUser, 'finance.reconcile')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { orderId?: unknown, transactionHash?: unknown } | null
  const orderId = typeof body?.orderId === 'string' ? body.orderId.trim() : ''
  const transactionHash = typeof body?.transactionHash === 'string' ? body.transactionHash.trim() : ''
  if (!orderId || !BASE_TX_HASH_RE.test(transactionHash)) {
    return NextResponse.json({ error: 'Provide a Minisend order id and a valid Base transaction hash.' }, { status: 400 })
  }

  const [intent] = await db.select().from(payment_intents).where(eq(payment_intents.external_reference, orderId)).limit(1)
  if (!intent || intent.direction !== 'withdrawal') {
    return NextResponse.json({ error: 'Withdrawal payment intent was not found for this order.' }, { status: 404 })
  }
  if (!['pending', 'processing'].includes(intent.status)) {
    return NextResponse.json({ error: 'This withdrawal is no longer waiting for funding.' }, { status: 409 })
  }

  const order = await submitMinisendOfframpDeposit({ orderId, transactionHash })
  const withdrawalRequestId = typeof intent.metadata?.withdrawalRequestId === 'string' ? intent.metadata.withdrawalRequestId : null
  const nextMetadata = {
    ...(intent.metadata || {}),
    order,
    providerFundingRequired: false,
    providerFundingStatus: order.status,
    providerFundingTransactionHash: transactionHash,
  }

  await db.transaction(async (tx) => {
    await tx.update(payment_intents).set({
      metadata: nextMetadata,
      updated_at: new Date(),
    }).where(eq(payment_intents.id, intent.id))
    await tx.insert(payment_events).values({
      payment_intent_id: intent.id,
      event_type: 'offramp.deposit.submitted',
      from_status: intent.status,
      to_status: intent.status,
      actor_type: 'admin',
      actor_id: currentUser.id,
      payload: { orderId, transactionHash, providerStatus: order.status },
    })
    if (withdrawalRequestId) {
      await tx.update(withdrawal_requests).set({
        status: 'processing',
        external_reference: order.order_id,
        review_note: 'Treasury Base USDC funding was submitted to provider; awaiting payout completion.',
      }).where(eq(withdrawal_requests.id, withdrawalRequestId))
    }
  })

  return NextResponse.json({ data: { order } })
}
