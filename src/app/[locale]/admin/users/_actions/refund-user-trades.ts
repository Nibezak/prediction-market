'use server'

import { recordAuditEvent } from '@/lib/audit'
import { UserRepository } from '@/lib/db/queries/user'
import { canMoveUserFunds, getUserPlatformRole } from '@/lib/staff-role'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

interface RefundUserTradesInput {
  marketId?: string
  eventId?: string
  from?: string
  to?: string
  reason?: string
}

export async function refundUserTrades(userId: string, input: RefundUserTradesInput) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canMoveUserFunds(currentUser)) {
    return { error: 'Only finance officers and administrators can refund trades.' }
  }

  const baseUrl = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
  const role = getUserPlatformRole(currentUser)
  const url = `${baseUrl}/admin/users/${encodeURIComponent(userId)}/refund-trades`
  const body = JSON.stringify(input)
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET || '',
      'x-tellwise-user-id': currentUser.id,
      'x-tellwise-user-email': currentUser.email || '',
      'x-tellwise-role': role,
      'x-tellwise-is-admin': role === 'SUPER_ADMIN' || role === 'ADMIN' ? 'true' : 'false',
    } }),
    body,
  })
  const payload = await response.json().catch(() => null)

  await recordAuditEvent({
    eventType: response.ok ? 'money.refund.completed' : 'money.refund.requested',
    category: 'money',
    action: 'Refund user trades',
    outcome: response.ok ? 'success' : 'failure',
    severity: 'warning',
    actorUserId: currentUser.id,
    actorRole: role,
    subjectUserId: userId,
    entityType: 'user_trade_refund',
    entityId: userId,
    metadata: { ...input, ledgerResponse: payload },
  })

  return response.ok
    ? { success: true, refundedCount: payload?.data?.refundedCount ?? 0 }
    : { error: payload?.error || 'Refund failed' }
}
