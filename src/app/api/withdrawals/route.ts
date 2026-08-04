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

export async function POST(request: Request) {
  const input = await request.json().catch(() => null) as {
    amount?: unknown
    amountKes?: unknown
    destination?: unknown
    withdrawalPin?: unknown
    idempotencyKey?: unknown
  } | null
  const body = JSON.stringify({
    amountKes: input?.amountKes ?? input?.amount,
    phoneNumber: input?.destination,
    walletPasscode: input?.withdrawalPin,
    idempotencyKey: typeof input?.idempotencyKey === 'string' ? input.idempotencyKey : randomUUID(),
  })
  try {
    const { response } = await slimefishBackendUserRequest('payments/withdrawals', { method: 'POST', body })
    if (!response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await readJsonResponse(response)
    if (!response.ok) return NextResponse.json({ error: payload?.error || 'Unable to start withdrawal.' }, { status: response.status })
    if (!payload?.data) return NextResponse.json({ error: 'The payment service returned an invalid response.' }, { status: 502 })
    return NextResponse.json({ data: { ...payload.data, message: 'Your M-Pesa payout is being processed.' } }, { status: 202 })
  }
  catch {
    return NextResponse.json({ error: 'The payment service is temporarily unavailable.' }, { status: 503 })
  }
}

export async function GET() {
  const { response } = await slimefishBackendUserRequest('payments/withdrawals')
  if (!response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const payload = await readJsonResponse(response)
  if (!response.ok) return NextResponse.json({ error: payload?.error || 'Withdrawals are temporarily unavailable.' }, { status: response.status })
  return NextResponse.json(payload ?? { data: [] }, { status: response.status })
}
