'use server'

import { UserRepository } from '@/lib/db/queries/user'
import { canMoveUserFunds, getUserPlatformRole } from '@/lib/staff-role'
import { recordAuditEvent } from '@/lib/audit'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

export async function adjustUserBalance(userId: string, direction: 'deposit' | 'withdraw', amount: number) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canMoveUserFunds(currentUser)) return { error: 'Only finance officers and administrators can move user funds.' }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) return { error: 'Enter a valid amount' }

  const baseUrl = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
  const url = `${baseUrl}/admin/users/${encodeURIComponent(userId)}/balance-adjustment`
  const body = JSON.stringify({ direction, amount })
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body, headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET || '',
      'x-tellwise-user-id': currentUser.id,
      'x-tellwise-user-email': currentUser.email || '',
      'x-tellwise-role': getUserPlatformRole(currentUser),
      'x-tellwise-is-admin': ['SUPER_ADMIN', 'ADMIN'].includes(getUserPlatformRole(currentUser)) ? 'true' : 'false',
    } }),
    body,
  })
  const payload = await response.json().catch(() => null)
  await recordAuditEvent({
    eventType: response.ok ? 'money.balance.adjustment.completed' : 'money.balance.adjustment.failed',
    category: 'money', action: `${direction === 'deposit' ? 'Credit' : 'Debit'} user balance`,
    outcome: response.ok ? 'success' : 'failure', severity: direction === 'withdraw' ? 'warning' : 'info',
    actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser), subjectUserId: userId,
    entityType: 'user_balance', entityId: userId, metadata: { direction, amount: Number(amount.toFixed(2)), ledgerResponse: payload },
  })
  return response.ok ? { success: true } : { error: payload?.error || 'Balance adjustment failed' }
}
