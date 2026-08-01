import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { isAdminEmail } from '@/lib/admin'
import { users } from '@/lib/db/schema/auth/tables'
import { db } from '@/lib/drizzle'
import { createMirrorCookie, MIRROR_COOKIE_NAME, MIRROR_MAX_AGE_SECONDS, verifyMirrorCookie } from '@/lib/user-mirroring'
import { hasStaffPermission } from '@/lib/staff-permissions'

async function actor() {
  const sessionUser = (await auth.api.getSession({ headers: await headers() }))?.user as any
  if (!sessionUser?.id) return null
  const rows = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1)
  return rows[0] ? { ...sessionUser, ...rows[0] } : sessionUser
}

export async function GET() {
  const current = await actor()
  if (!current || (!isAdminEmail(current.email) && !hasStaffPermission(current, 'users.mirror'))) return NextResponse.json({ active: false })
  const value = (await cookies()).get(MIRROR_COOKIE_NAME)?.value
  const mirror = verifyMirrorCookie(value, current.id)
  if (!mirror) return NextResponse.json({ active: false })
  const target = await db.select({ id: users.id, email: users.email, username: users.username }).from(users).where(eq(users.id, mirror.targetUserId)).limit(1)
  return NextResponse.json({ active: true, target: target[0] || null, expiresAt: mirror.expiresAt })
}

export async function POST(request: Request) {
  const current = await actor()
  if (!current || (!isAdminEmail(current.email) && !hasStaffPermission(current, 'users.mirror'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => null) as { targetUserId?: string } | null
  if (!body?.targetUserId || body.targetUserId === current.id) {
    return NextResponse.json({ error: 'The target is invalid.' }, { status: 403 })
  }
  const target = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, body.targetUserId)).limit(1)
  if (!target[0]) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  const value = createMirrorCookie(current.id, target[0].id)
  if (!value) return NextResponse.json({ error: 'Mirroring is not configured.' }, { status: 503 })
  const response = NextResponse.json({ success: true, target: target[0] })
  response.cookies.set(MIRROR_COOKIE_NAME, value, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: MIRROR_MAX_AGE_SECONDS })
  await recordAuditEvent({ eventType: 'user.staff.impersonation.started', category: 'security', action: 'Started support mirror session', severity: 'high', actorUserId: current.id, actorRole: String(current.role || 'STAFF'), subjectUserId: target[0].id, entityType: 'user', entityId: target[0].id, ...requestAuditContext(await headers()) })
  return response
}

export async function DELETE(request: Request) {
  const current = await actor()
  const response = NextResponse.json({ success: true })
  response.cookies.set(MIRROR_COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 0 })
  if (current) await recordAuditEvent({ eventType: 'user.staff.impersonation.ended', category: 'security', action: 'Ended support mirror session', severity: 'info', actorUserId: current.id, actorRole: 'ADMIN', ...requestAuditContext(request.headers) })
  return response
}
