import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { notifications, push_deliveries } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { enforceRateLimit } from '@/lib/security/rate-limit'

const eventSchema = z.object({
  notificationId: z.string().length(26),
  action: z.literal('opened'),
})

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await enforceRateLimit({ scope: 'push-engagement', identifier: session.user.id, limit: 60, windowSeconds: 60 })
  const parsed = eventSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid notification event.' }, { status: 400 })
  const [owned] = await db.select({ id: notifications.id }).from(notifications).where(and(
    eq(notifications.id, parsed.data.notificationId),
    eq(notifications.user_id, session.user.id),
  )).limit(1)
  if (!owned) return NextResponse.json({ error: 'Notification not found.' }, { status: 404 })
  await db.update(push_deliveries).set({ opened_at: new Date() }).where(and(
    eq(push_deliveries.notification_id, owned.id),
    eq(push_deliveries.status, 'delivered'),
  ))
  return NextResponse.json({ recorded: true })
}
