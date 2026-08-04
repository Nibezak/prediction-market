import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { slimefishBackendUserRequest } from '@/lib/slimefish-backend-user-request'

async function readJsonResponse(response: Response) {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  }
  catch {
    return null
  }
}

function publicStatus(status: string) {
  if (status === 'SUCCEEDED') return 'COMPLETED'
  if (status === 'FAILED' || status === 'EXPIRED') return 'FAILED'
  return 'PENDING_STK'
}

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as { fiatAmount?: unknown; phoneNumber?: unknown } | null
  const body = JSON.stringify({
    amountKes: input?.fiatAmount,
    phoneNumber: input?.phoneNumber,
    idempotencyKey: request.headers.get('idempotency-key') || randomUUID(),
  })
  try {
    const { response } = await slimefishBackendUserRequest('payments/deposits', { method: 'POST', body })
    if (!response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await readJsonResponse(response)
    if (!response.ok) return NextResponse.json({ error: payload?.error || 'Unable to start deposit.' }, { status: response.status })
    if (!payload?.data) return NextResponse.json({ error: 'The payment service returned an invalid response.' }, { status: 502 })
    const intent = payload.data
    return NextResponse.json({
      depositId: intent.id,
      status: publicStatus(intent.status),
      phoneNumber: intent.phoneNumber,
      message: intent.status === 'SUCCEEDED' ? 'Deposit completed.' : 'Check your phone to approve the M-Pesa request.',
      fiatCurrency: 'KES',
      fiatAmount: String(intent.requestedAmount),
      cryptoCurrency: 'KES',
      cryptoAmount: String(intent.netAmount),
      feeFiat: String(intent.providerFee || 0),
      provider: 'cloud9',
    }, { status: intent.status === 'SUCCEEDED' ? 200 : 202 })
  }
  catch {
    return NextResponse.json({ error: 'The payment service is temporarily unavailable.' }, { status: 503 })
  }
}

export async function GET() {
  const { response } = await slimefishBackendUserRequest('payments/deposits')
  if (!response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await readJsonResponse(response)
  if (!response.ok) return NextResponse.json({ error: payload?.error || 'Deposits are temporarily unavailable.' }, { status: response.status })
  return NextResponse.json(payload ?? { data: [] }, { status: response.status })
}
