import type { NextRequest } from 'next/server'
import type { User } from '@/types'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { UserRepository } from '@/lib/db/queries/user'
import { users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'
import { getStaffPermissions, hasStaffPermission } from '@/lib/staff-permissions'
import { canManageUsers, getUserPlatformRole } from '@/lib/staff-role'

const PROPOSER_PERMISSIONS = ['governance.resolution.propose', 'markets.resolve'] as const

function toStaffUser(user: Record<string, any>): Partial<User> {
  return {
    ...user,
    username: user.username ?? undefined,
    image: user.image ?? undefined,
    settings: user.settings ?? undefined,
  } as Partial<User>
}

export async function GET() {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canManageUsers(currentUser)) {
    return NextResponse.json({ error: 'User permission management access required.' }, { status: 403 })
  }

  const rows = await db.select({
    id: users.id,
    email: users.email,
    username: users.username,
    image: users.image,
    settings: users.settings,
  }).from(users)

  return NextResponse.json({
    data: rows.map((user) => {
      const staffUser = toStaffUser(user)
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        image: user.image,
        role: getUserPlatformRole(staffUser),
        enabled: hasStaffPermission(staffUser, 'governance.resolution.propose')
          && hasStaffPermission(staffUser, 'markets.resolve'),
      }
    }),
  })
}

export async function POST(request: NextRequest) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  if (!currentUser || !canManageUsers(currentUser)) {
    return NextResponse.json({ error: 'User permission management access required.' }, { status: 403 })
  }

  const payload = await request.json().catch(() => null) as { userId?: unknown, enabled?: unknown } | null
  const userId = typeof payload?.userId === 'string' ? payload.userId.trim() : ''
  if (!userId || typeof payload?.enabled !== 'boolean') {
    return NextResponse.json({ error: 'userId and enabled are required.' }, { status: 400 })
  }

  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!target) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  }

  const permissions = new Set(getStaffPermissions(toStaffUser(target)))
  for (const permission of PROPOSER_PERMISSIONS) {
    if (payload.enabled) permissions.add(permission)
    else permissions.delete(permission)
  }

  const settings = target.settings && typeof target.settings === 'object' ? target.settings : {}
  await db.update(users).set({
    settings: { ...settings, staff_permissions: [...permissions] },
  }).where(eq(users.id, target.id))

  await recordAuditEvent({
    eventType: 'user.role.changed',
    category: 'administration',
    action: payload.enabled ? 'Enabled resolution proposer' : 'Disabled resolution proposer',
    actorUserId: currentUser.id,
    actorRole: getUserPlatformRole(currentUser),
    subjectUserId: target.id,
    entityType: 'user',
    entityId: target.id,
    metadata: { permissions: PROPOSER_PERMISSIONS },
    ...requestAuditContext(request.headers),
  })

  return NextResponse.json({ data: { id: target.id, enabled: payload.enabled } })
}
