'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath, updateTag } from 'next/cache'
import { db } from '@/lib/drizzle'
import { notifications, users } from '@/lib/db/schema'
import { UserRepository } from '@/lib/db/queries/user'
import { cacheTags } from '@/lib/cache-tags'
import { canManageUsers, isProtectedSuperAdmin } from '@/lib/staff-role'
import { getUserPlatformRole } from '@/lib/staff-role'
import { recordAuditEvent } from '@/lib/audit'
import { getRolePermissionPreset, hasStaffPermission, STAFF_PERMISSIONS } from '@/lib/staff-permissions'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const SLIMEFISH_BACKEND_API_URL = process.env.NEXT_PUBLIC_SLIMEFISH_BACKEND_API_URL || 'http://localhost:8000/api'
const USER_ROLES = ['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN'] as const

async function updateSlimefishBackendUser(adminUserId: string, body: Record<string, unknown>) {
  const url = `${SLIMEFISH_BACKEND_API_URL}/v1/admin/users`
  const requestBody = JSON.stringify(body)
  const response = await fetch(url, {
    method: 'PATCH',
    headers: signSlimefishBackendRequest({ url, method: 'PATCH', body: requestBody, headers: {
      'Content-Type': 'application/json',
      'x-tellwise-secret': process.env.TELLWISE_SECRET || '',
      'x-tellwise-user-id': adminUserId,
      'x-tellwise-is-admin': 'true',
    } }),
    body: requestBody,
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error || 'The trading service rejected the update')
  }
}

/**
 * Helper to safely build the base settings expression.
 * Ensures we always start from a valid JSON object even when the column is NULL
 * or contains a non-object JSON value (e.g. a string or array).
 */
function safeSettingsBase() {
  return sql`(
    CASE
      WHEN jsonb_typeof(coalesce(${users.settings}, '{}'::jsonb)) = 'object'
      THEN coalesce(${users.settings}, '{}'::jsonb)
      ELSE '{}'::jsonb
    END
  )`
}

export async function toggleUserBlockedStatus(userId: string, isBlocked: boolean) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !hasStaffPermission(currentUser, isBlocked ? 'users.block' : 'users.unblock')) {
    return { error: 'Unauthorized' }
  }

  try {
    const targetRows = await db.select({ email: users.email, settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
    if (isProtectedSuperAdmin(targetRows[0] as any)) {
      return { error: 'The super admin account cannot be blocked or modified.' }
    }

    try {
      await updateSlimefishBackendUser(currentUser.id, { userId, tradingBlocked: isBlocked })
    } catch (pmError) {
      console.warn('SlimefishBackend user update failed (non-fatal):', pmError)
    }

    await db
      .update(users)
      .set({
        settings: sql`
          jsonb_set(
            jsonb_set(
              ${safeSettingsBase()},
              '{is_blocked}',
              ${isBlocked ? sql`'true'::jsonb` : sql`'false'::jsonb`}
            ),
            '{tradingBlocked}',
            ${isBlocked ? sql`'true'::jsonb` : sql`'false'::jsonb`}
          )
        `
      })
      .where(eq(users.id, userId))

    try {
      await recordAuditEvent({
        eventType: isBlocked ? 'user.trading.blocked' : 'user.trading.unblocked', category: 'user',
        action: isBlocked ? 'Blocked user from trading' : 'Restored user trading access',
        severity: isBlocked ? 'high' : 'info', actorUserId: currentUser.id,
        actorRole: getUserPlatformRole(currentUser), subjectUserId: userId,
        entityType: 'user', entityId: userId, beforeValues: { isBlocked: !isBlocked }, afterValues: { isBlocked },
      })
    } catch (auditError) {
      console.warn('Audit record failed (non-fatal):', auditError)
    }

    try {
      await db.insert(notifications).values({
        user_id: userId,
        category: 'account',
        title: isBlocked ? 'Trading access suspended' : 'Trading access restored',
        description: isBlocked
          ? 'Your account cannot place trades, deposit, or withdraw while our team reviews it.'
          : 'Your account review is complete and trading access has been restored.',
        metadata: { action: isBlocked ? 'blocked' : 'unblocked', actorUserId: currentUser.id },
        link_type: 'settings',
        link_target: '/settings',
        link_url: '/settings',
        link_label: 'View account',
      })
      updateTag(cacheTags.notifications(userId))
    } catch (notifError) {
      console.warn('Notification insert failed (non-fatal):', notifError)
    }

    revalidatePath('/[locale]/admin/users', 'page')
    return { success: true }
  } catch (error) {
    console.error('Error toggling user block status:', error)
    return { error: `Failed to update user status: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

export async function updateUserRole(userId: string, role: typeof USER_ROLES[number], permissions?: string[]) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!canManageUsers(currentUser)) {
    return { error: 'Unauthorized' }
  }
  if (!USER_ROLES.includes(role)) {
    return { error: 'Invalid role' }
  }
  const allowedPermissions = new Set(STAFF_PERMISSIONS)
  const resolvedPermissions = (permissions || getRolePermissionPreset(role)).filter(permission => allowedPermissions.has(permission as any))
  try {
    const targetRows = await db.select({ email: users.email, settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
    if (isProtectedSuperAdmin(targetRows[0] as any)) {
      return { error: 'The super admin account cannot be demoted or modified.' }
    }

    try {
      await updateSlimefishBackendUser(currentUser.id, { userId, role })
    } catch (pmError) {
      console.warn('SlimefishBackend user role update failed (non-fatal):', pmError)
    }

    const permissionsJson = JSON.stringify(resolvedPermissions)
    await db
      .update(users)
      .set({
        settings: sql`
          jsonb_set(
            jsonb_set(
              ${safeSettingsBase()},
              '{staff_permissions}',
              ${permissionsJson}::jsonb,
              true
            ),
            '{staff_role}',
            to_jsonb(${role}::text),
            true
          )
        `,
      })
      .where(eq(users.id, userId))

    try {
      await recordAuditEvent({
        eventType: 'user.role.changed', category: 'user', action: `Changed platform role to ${role}`,
        severity: 'high', actorUserId: currentUser.id, actorRole: getUserPlatformRole(currentUser),
        subjectUserId: userId, entityType: 'user', entityId: userId, afterValues: { role, permissions: resolvedPermissions },
      })
    } catch (auditError) {
      console.warn('Audit record failed (non-fatal):', auditError)
    }

    try {
      await db.insert(notifications).values({
        user_id: userId,
        category: 'account',
        title: role === 'USER' ? 'Your platform role changed' : 'Your account has been elevated',
        description: role === 'USER'
          ? 'Your Slimefish staff access has been removed.'
          : `Congrats, your Slimefish role is now ${role.toLowerCase()}. Enable two-factor authentication before opening admin tools.`,
        metadata: { role, permissions: resolvedPermissions, actorUserId: currentUser.id },
        link_type: 'settings',
        link_target: role === 'USER' ? '/settings' : '/settings/account',
        link_url: role === 'USER' ? '/settings' : '/settings/account',
        link_label: role === 'USER' ? 'View account' : 'Enable 2FA',
      })
      updateTag(cacheTags.notifications(userId))
    } catch (notifError) {
      console.warn('Notification insert failed (non-fatal):', notifError)
    }

    revalidatePath('/[locale]/admin/users', 'page')
    return { success: true }
  } catch (error) {
    console.error('Error updating user role:', error)
    return { error: `Failed to update user role: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

export async function authorizeWithdrawalPasscodeReset(userId: string) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!canManageUsers(currentUser)) {
    return { error: 'Unauthorized' }
  }

  try {
    const targetRows = await db.select({ email: users.email, settings: users.settings }).from(users).where(eq(users.id, userId)).limit(1)
    const target = targetRows[0]
    if (!target) {
      return { error: 'User not found' }
    }
    if (isProtectedSuperAdmin(target as any)) {
      return { error: 'The super admin account cannot be modified by another account.' }
    }

    await db.update(users).set({
      withdrawal_phone_pin_hash: null,
      withdrawal_phone_pin_set_at: null,
      settings: sql`${safeSettingsBase()} #- '{withdrawalSecurity,pinSetAt}'`,
    }).where(eq(users.id, userId))

    await recordAuditEvent({
      eventType: 'user.withdrawal_passcode.reset_authorized',
      category: 'security',
      action: 'Authorized withdrawal passcode reset',
      severity: 'high',
      actorUserId: currentUser.id,
      actorRole: getUserPlatformRole(currentUser),
      subjectUserId: userId,
      entityType: 'user',
      entityId: userId,
      metadata: { identityVerifiedBySupport: true },
    })

    await db.insert(notifications).values({
      user_id: userId,
      category: 'security',
      title: 'Create a new withdrawal passcode',
      description: 'Support authorized a passcode reset. Open Slimefish to create a new passcode before withdrawing.',
      metadata: { action: 'withdrawal_passcode_reset', actorUserId: currentUser.id },
      link_type: 'settings',
      link_target: '/settings',
      link_url: '/settings',
      link_label: 'Secure account',
    })
    updateTag(cacheTags.notifications(userId))
    revalidatePath('/[locale]/admin/users', 'page')
    return { success: true }
  }
  catch (error) {
    console.error('Error authorizing withdrawal passcode reset:', error)
    return { error: 'Could not authorize the passcode reset. Please try again.' }
  }
}

export async function bulkToggleUserBlockedStatus(userIds: string[], isBlocked: boolean) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { error: 'No users selected' }
  }

  let successCount = 0
  let failCount = 0

  for (const userId of userIds) {
    const res = await toggleUserBlockedStatus(userId, isBlocked)
    if (res.success) {
      successCount++
    } else {
      failCount++
    }
  }

  revalidatePath('/[locale]/admin/users', 'page')
  return { success: true, successCount, failCount }
}

export async function bulkUpdateUserRoles(userIds: string[], role: typeof USER_ROLES[number]) {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return { error: 'No users selected' }
  }

  let successCount = 0
  let failCount = 0

  for (const userId of userIds) {
    const res = await updateUserRole(userId, role)
    if (res.success) {
      successCount++
    } else {
      failCount++
    }
  }

  revalidatePath('/[locale]/admin/users', 'page')
  return { success: true, successCount, failCount }
}
