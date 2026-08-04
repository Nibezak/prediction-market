import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { push_subscriptions } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { enforceRateLimit } from '@/lib/security/rate-limit'

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(4096),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(20).max(512),
    auth: z.string().min(8).max(256),
  }),
  locale: z.string().trim().min(2).max(16).optional(),
  timezone: z.string().trim().min(1).max(100).optional(),
  platform: z.enum(['android', 'ios', 'desktop', 'web']).optional(),
})

async function currentUserId() {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  return session?.user?.id ?? null
}

export async function GET() {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ enabled: false }, { status: 401 })
  const rows = await db.select({ endpoint: push_subscriptions.endpoint, enabled: push_subscriptions.enabled })
    .from(push_subscriptions).where(eq(push_subscriptions.user_id, userId))
  return NextResponse.json({ enabled: rows.some(row => row.enabled), subscriptions: rows.length })
}

export async function POST(request: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await enforceRateLimit({ scope: 'push-subscription-write', identifier: userId, limit: 10, windowSeconds: 60 })
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid push subscription.' }, { status: 400 })
  const value = parsed.data
  await db.insert(push_subscriptions).values({
    user_id: userId,
    endpoint: value.endpoint,
    p256dh: value.keys.p256dh,
    auth: value.keys.auth,
    locale: value.locale || 'en',
    timezone: value.timezone,
    platform: value.platform || 'web',
    user_agent: request.headers.get('user-agent'),
  }).onConflictDoUpdate({
    target: push_subscriptions.endpoint,
    set: {
      user_id: userId,
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
      locale: value.locale || 'en',
      timezone: value.timezone,
      platform: value.platform || 'web',
      user_agent: request.headers.get('user-agent'),
      enabled: true,
      failure_count: 0,
      last_seen_at: new Date(),
      updated_at: new Date(),
    },
  })
  return NextResponse.json({ enabled: true })
}

export async function DELETE(request: Request) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await enforceRateLimit({ scope: 'push-subscription-write', identifier: userId, limit: 10, windowSeconds: 60 })
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null
  const endpoint = typeof body?.endpoint === 'string' ? body.endpoint : null
  const rows = await db.select({ id: push_subscriptions.id, endpoint: push_subscriptions.endpoint })
    .from(push_subscriptions).where(eq(push_subscriptions.user_id, userId))
  for (const row of rows) {
    if (!endpoint || row.endpoint === endpoint) {
      await db.update(push_subscriptions).set({ enabled: false, updated_at: new Date() }).where(eq(push_subscriptions.id, row.id))
    }
  }
  return NextResponse.json({ enabled: false })
}
