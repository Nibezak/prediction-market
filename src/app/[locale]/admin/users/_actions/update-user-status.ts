'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/drizzle'
import { users } from '@/lib/db/schema'
import { UserRepository } from '@/lib/db/queries/user'
import { canManageUsers } from '@/lib/staff-role'
import { getUserPlatformRole } from '@/lib/staff-role'
import { recordAuditEvent } from '@/lib/audit'

const PLAY_MONEY_API_URL = process.env.NEXT_PUBLIC_PLAY_MONEY_API_URL || 'http://localhost:8000/api'
const USER_ROLES = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const

async function updatePlayMoneyUser(adminUserId: string, body: Record<string, unknown>) {
  const response = await fetch(`${PLAY_MONEY_API_URL}/v1/admin/users`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET || '',
      'x-tellwise-user-id': adminUserId,
      'x-tellwise-is-admin': 'true',
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || 'The trading service rejected the update')
  }
}

export async function toggleUserBlockedStatus(userId: string, isBlocked: boolean) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canManageUsers(currentUser)) {
    return { error: 'Unauthorized' }
  }

  try {
    await updatePlayMoneyUser(currentUser.id, { userId, tradingBlocked: isBlocked })
    await db
      .update(users)
      .set({
        settings: sql`
          jsonb_set(
            CASE
              WHEN jsonb_typeof(coalesce(${users.settings}, '{}'::jsonb)) = 'object'
              THEN coalesce(${users.settings}, '{}'::jsonb)
              ELSE '{}'::jsonb
            END,
            '{is_blocked}',
            ${isBlocked ? 'true' : 'false'}::jsonb
          )
        `
      })
      .where(eq(users.id, userId))

    await recordAuditEvent({
      eventType: isBlocked ? 'user.trading.blocked' : 'user.trading.unblocked', category: 'user',
      action: isBlocked ? 'Blocked user from trading' : 'Restored user trading access',
      severity: isBlocked ? 'high' : 'info', actorUserId: currentUser.id,
      actorRole: getUserPlatformRole(currentUser), subjectUserId: userId,
      entityType: 'user', entityId: userId, beforeValues: { isBlocked: !isBlocked }, afterValues: { isBlocked },
    })

    revalidatePath('/[locale]/admin/users', 'page')
    return { success: true }
  } catch (error) {
    console.error('Error toggling user block status:', error)
    return { error: 'Failed to update user status' }
  }
}

export async function updateUserRole(userId: string, role: typeof USER_ROLES[number]) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!canManageUsers(currentUser)) {
    return { error: 'Unauthorized' }
  }
  if (!USER_ROLES.includes(role)) {
    return { error: 'Invalid role' }
  }
  try {
    await updatePlayMoneyUser(currentUser.id, { userId, role })
    await db
      .update(users)
      .set({
        settings: sql`jsonb_set(
          CASE WHEN jsonb_typeof(coalesce(${users.settings}, '{}'::jsonb)) = 'object'
            THEN coalesce(${users.settings}, '{}'::jsonb) ELSE '{}'::jsonb END,
          '{staff_role}', to_jsonb(${role}::text), true
        )`,
      })
      .where(eq(users.id, userId))
    await recordAuditEvent({
      eventType: 'user.role.changed', category: 'user', action: `Changed platform role to ${role}`,
      severity: 'high', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser),
      subjectUserId: userId, entityType: 'user', entityId: userId, afterValues: { role },
    })
    revalidatePath('/[locale]/admin/users', 'page')
    return { success: true }
  } catch (error) {
    console.error('Error updating user role:', error)
    return { error: error instanceof Error ? error.message : 'Failed to update user role' }
  }
}
