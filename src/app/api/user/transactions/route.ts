import { NextResponse } from 'next/server'
import { slimefishBackendUserRequest } from '@/lib/slimefish-backend-user-request'

export async function GET() {
  const { response } = await slimefishBackendUserRequest('payments')
  if (!response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await response.json().catch(() => null)
  if (!response.ok) return NextResponse.json({ error: 'Transactions are temporarily unavailable.' }, { status: response.status })
  const rows = (payload?.data || []).map((intent: any) => ({
    id: intent.id,
    direction: intent.direction === 'WITHDRAWAL' ? 'withdrawal' : 'deposit',
    status: intent.status === 'SUCCEEDED' ? 'succeeded' : intent.status.toLowerCase(),
    sourceCurrency: 'KES',
    destinationCurrency: 'KES',
    grossAmount: String(intent.requestedAmount),
    providerFee: String(intent.providerFee || 0),
    netAmount: String(intent.netAmount),
    externalReference: intent.providerReference || intent.reference,
    failureMessage: intent.failureMessage,
    metadata: intent.metadata,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
    completedAt: intent.completedAt,
  }))
  return NextResponse.json({ data: rows })
}
