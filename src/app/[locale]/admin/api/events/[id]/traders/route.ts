import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { UserRepository } from '@/lib/db/queries/user'
import { getUserPlatformRole, isStaffUser } from '@/lib/staff-role'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

function getApiUrl() {
  return process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'
}

function getServiceSecret() {
  return process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim()
    || process.env.TELLWISE_SECRET?.trim()
    || ''
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !isStaffUser(currentUser)) {
    return NextResponse.json({ error: 'Unauthenticated.' }, { status: 401 })
  }

  const serviceSecret = getServiceSecret()
  if (!serviceSecret) {
    return NextResponse.json({ error: 'Slimefish ledger service credentials are not configured' }, { status: 503 })
  }

  const { id } = await params
  const platformRole = getUserPlatformRole(currentUser)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-tellwise-secret': process.env.TELLWISE_SECRET?.trim() || serviceSecret,
    'x-tellwise-user-id': currentUser.id,
    'x-tellwise-role': platformRole,
    'x-tellwise-is-admin': platformRole === 'ADMIN' ? 'true' : 'false',
  }
  if (currentUser.email?.trim()) {
    headers['x-tellwise-user-email'] = currentUser.email.trim().toLowerCase()
  }

  const url = `${getApiUrl()}/v1/admin/events/${encodeURIComponent(id)}/traders`
  const response = await fetch(url, {
    method: 'GET',
    headers: signSlimefishBackendRequest({ url, headers }),
  })
  const payload = await response.json().catch(() => null)

  return NextResponse.json(
    response.ok ? payload : { error: payload?.error || 'Failed to fetch event traders' },
    { status: response.status },
  )
}
