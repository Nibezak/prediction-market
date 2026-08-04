import { desc, ilike, or } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { recordAuditEvent } from '@/lib/audit'
import { UserRepository } from '@/lib/db/queries/user'
import { notification_campaigns, users } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { dispatchNotificationCampaign, notificationCampaignSchema, NOTIFICATION_SEND_PERMISSION, selectNotificationAudience } from '@/lib/push-notifications'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { getUserPlatformRole } from '@/lib/staff-role'
import { hasStaffPermission } from '@/lib/staff-permissions'

async function authorizedUser() {
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  return user && hasStaffPermission(user, NOTIFICATION_SEND_PERMISSION) ? user : null
}

export async function GET(request: Request) {
  const user = await authorizedUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 120) || ''
  if (query.length >= 2) {
    const matches = await db.select({ id: users.id, username: users.username, email: users.email })
      .from(users)
      .where(or(ilike(users.email, `%${query}%`), ilike(users.username, `%${query}%`)))
      .limit(20)
    return NextResponse.json({ users: matches }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const rows = await db.select().from(notification_campaigns).orderBy(desc(notification_campaigns.created_at)).limit(50)
  return NextResponse.json({ campaigns: rows }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const user = await authorizedUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  await enforceRateLimit({ scope: 'admin-notification-campaign', identifier: user.id, limit: 10, windowSeconds: 60 })
  const parsed = notificationCampaignSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the notification content and audience filters.' }, { status: 400 })
  const input = parsed.data
  const audience = await selectNotificationAudience(input.criteria)
  if (audience.length === 0) return NextResponse.json({ error: 'No users match this audience.' }, { status: 400 })
  const scheduledFor = input.scheduledFor ? new Date(input.scheduledFor) : null
  const shouldSendNow = !scheduledFor || scheduledFor.getTime() <= Date.now() + 5_000
  const [campaign] = await db.insert(notification_campaigns).values({
    created_by_user_id: user.id,
    title: input.title,
    body: input.body,
    category: input.category,
    link_url: input.linkUrl || null,
    criteria: input.criteria,
    use_ai_copy: input.useAiCopy,
    status: 'scheduled',
    scheduled_for: shouldSendNow ? new Date() : scheduledFor,
    audience_count: audience.length,
  }).returning({ id: notification_campaigns.id })
  await recordAuditEvent({
    eventType: 'notification.created',
    category: 'community',
    action: shouldSendNow ? 'Sent notification campaign' : 'Scheduled notification campaign',
    actorUserId: user.id,
    actorRole: getUserPlatformRole(user),
    entityType: 'notification_campaign',
    entityId: campaign.id,
    metadata: { audienceCount: audience.length, criteria: input.criteria, scheduledFor },
  }).catch(() => null)
  const result = shouldSendNow ? await dispatchNotificationCampaign(campaign.id) : null
  return NextResponse.json({ id: campaign.id, audienceCount: audience.length, result }, { status: 201 })
}
