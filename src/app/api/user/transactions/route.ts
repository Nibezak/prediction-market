import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { payment_intents } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({
      id: payment_intents.id,
      direction: payment_intents.direction,
      status: payment_intents.status,
      sourceCurrency: payment_intents.source_currency,
      destinationCurrency: payment_intents.destination_currency,
      grossAmount: payment_intents.gross_amount,
      providerFee: payment_intents.provider_fee,
      netAmount: payment_intents.net_amount,
      externalReference: payment_intents.external_reference,
      failureMessage: payment_intents.failure_message,
      metadata: payment_intents.metadata,
      createdAt: payment_intents.created_at,
      updatedAt: payment_intents.updated_at,
      completedAt: payment_intents.completed_at,
    })
    .from(payment_intents)
    .where(eq(payment_intents.user_id, session.user.id))
    .orderBy(desc(payment_intents.created_at))
    .limit(100)

  return NextResponse.json({ data: rows })
}
