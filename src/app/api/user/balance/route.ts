import { NextResponse } from 'next/server'
import { slimefishBackendUserRequest } from '@/lib/slimefish-backend-user-request'

export async function GET() {
  const { response } = await slimefishBackendUserRequest('payments/balance')
  if (!response) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return new NextResponse(await response.text(), {
    status: response.status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  })
}
