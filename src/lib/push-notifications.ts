import type { StaffPermission } from '@/lib/staff-permissions'
import webPush from 'web-push'
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm'
import { z } from 'zod'
import { loadOpenRouterProviderSettings } from '@/lib/ai/market-context-config'
import { requestOpenRouterCompletion } from '@/lib/ai/openrouter'
import {
  notification_campaigns,
  event_notification_dispatches,
  event_tags,
  events,
  markets,
  notifications,
  payment_intents,
  push_deliveries,
  push_subscriptions,
  sessions,
  tags,
  users,
} from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { loadNotificationLedgerReport } from '@/lib/slimefish-backend-reporting'
import { getUserPlatformRole } from '@/lib/staff-role'

export const notificationAudienceSchema = z.object({
  includeUserIds: z.array(z.string().min(1)).max(500).default([]),
  excludeUserIds: z.array(z.string().min(1)).max(500).default([]),
  includeCountries: z.array(z.string().trim().min(2).max(64)).max(100).default([]),
  excludeCountries: z.array(z.string().trim().min(2).max(64)).max(100).default([]),
  roles: z.array(z.enum(['USER', 'EDITOR', 'MODERATOR', 'RESOLVER', 'SUPPORT', 'FINANCE', 'ADMIN', 'SUPER_ADMIN'])).default([]),
  currencies: z.array(z.enum(['KES', 'USD'])).default([]),
  hasTraded: z.boolean().nullable().default(null),
  hasWon: z.boolean().nullable().default(null),
  hasDeposited: z.boolean().nullable().default(null),
  activeWithinDays: z.number().int().min(1).max(365).nullable().default(null),
  inactiveForDays: z.number().int().min(1).max(365).nullable().default(null),
  signedUpAfter: z.string().datetime().nullable().default(null),
  signedUpBefore: z.string().datetime().nullable().default(null),
  pushEnabledOnly: z.boolean().default(false),
})

export type NotificationAudience = z.infer<typeof notificationAudienceSchema>

export const notificationCampaignSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(240),
  category: z.string().trim().min(1).max(40).default('platform'),
  linkUrl: z.string().trim().max(500).optional().default(''),
  useAiCopy: z.boolean().default(true),
  scheduledFor: z.string().datetime().nullable().default(null),
  criteria: notificationAudienceSchema,
})

interface NotificationCopy {
  title: string
  body: string
}

function readNestedSetting(settings: Record<string, any> | null | undefined, ...paths: string[]) {
  for (const path of paths) {
    let value: any = settings
    for (const part of path.split('.')) value = value?.[part]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return ''
}

function normalizeList(values: string[]) {
  return new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))
}

function validInternalLink(linkUrl: string | null | undefined) {
  const value = linkUrl?.trim() || ''
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return false
  webPush.setVapidDetails(process.env.WEB_PUSH_SUBJECT?.trim() || 'mailto:support@slimefish.com', publicKey, privateKey)
  return true
}

function localHour(timezone: string | null) {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone || 'Africa/Nairobi' }).format(new Date())) % 24
  }
  catch {
    return new Date().getUTCHours()
  }
}

async function shouldDeliverNow(subscription: typeof push_subscriptions.$inferSelect, category: string) {
  if (category === 'security' || category === 'money') return true
  const hour = localHour(subscription.timezone)
  if (hour >= 21 || hour < 7) return false
  const recent = await db.select({ id: push_deliveries.id }).from(push_deliveries).where(and(
    eq(push_deliveries.subscription_id, subscription.id),
    eq(push_deliveries.status, 'delivered'),
    gte(push_deliveries.delivered_at, new Date(Date.now() - 86_400_000)),
  )).limit(4)
  return recent.length < 4
}

export async function rewriteNotificationCopy(fallback: NotificationCopy): Promise<NotificationCopy> {
  const settings = await loadOpenRouterProviderSettings().catch(() => null)
  if (!settings?.configured || !settings.apiKey) return fallback
  try {
    const raw = await requestOpenRouterCompletion([
      {
        role: 'system',
        content: 'You edit opt-in financial app push notifications. Preserve every fact, amount, proper noun, and implied certainty. Never add urgency, guarantees, fear, loss claims, or investment advice. Return only JSON with title and body. Title max 55 characters; body max 140 characters.',
      },
      { role: 'user', content: JSON.stringify(fallback) },
    ], { apiKey: settings.apiKey, model: settings.model, temperature: 0.25, maxTokens: 120 })
    const parsed = JSON.parse(raw.replace(/^```json\s*|\s*```$/g, '')) as Partial<NotificationCopy>
    const title = typeof parsed.title === 'string' ? parsed.title.trim().slice(0, 55) : ''
    const body = typeof parsed.body === 'string' ? parsed.body.trim().slice(0, 140) : ''
    return title && body ? { title, body } : fallback
  }
  catch {
    return fallback
  }
}

async function loadLedgerSegments() {
  try {
    const { segments: rows } = await loadNotificationLedgerReport<{
      segments: Array<{ userId: string, hasTraded: boolean, hasWon: boolean }>
      affinities: TradeAffinityRow[]
    }>()
    return new Map(rows.map(row => [String(row.userId), {
      hasTraded: Boolean(row.hasTraded),
      hasWon: Boolean(row.hasWon),
    }]))
  }
  catch {
    return new Map<string, { hasTraded: boolean, hasWon: boolean }>()
  }
}

export async function selectNotificationAudience(criteriaInput: NotificationAudience) {
  const criteria = notificationAudienceSchema.parse(criteriaInput)
  const [userRows, deposits, activeSessions, subscriptions, ledgerSegments] = await Promise.all([
    db.select({ id: users.id, email: users.email, username: users.username, settings: users.settings, createdAt: users.created_at }).from(users),
    db.select({ userId: payment_intents.user_id }).from(payment_intents).where(eq(payment_intents.status, 'completed')),
    db.select({ userId: sessions.user_id, updatedAt: sessions.updated_at }).from(sessions),
    db.select({ userId: push_subscriptions.user_id }).from(push_subscriptions).where(eq(push_subscriptions.enabled, true)),
    loadLedgerSegments(),
  ])
  const includeIds = new Set(criteria.includeUserIds)
  const excludeIds = new Set(criteria.excludeUserIds)
  const includeCountries = normalizeList(criteria.includeCountries)
  const excludeCountries = normalizeList(criteria.excludeCountries)
  const depositors = new Set(deposits.map(row => row.userId))
  const pushUsers = new Set(subscriptions.map(row => row.userId))
  const lastActive = new Map<string, number>()
  for (const session of activeSessions) {
    const time = session.updatedAt.getTime()
    lastActive.set(session.userId, Math.max(time, lastActive.get(session.userId) || 0))
  }
  const now = Date.now()
  return userRows.filter((user) => {
    if (includeIds.size && !includeIds.has(user.id)) return false
    if (excludeIds.has(user.id)) return false
    const country = readNestedSetting(user.settings, 'profile.country', 'country', 'last_known_country').toLowerCase()
    if (includeCountries.size && !includeCountries.has(country)) return false
    if (excludeCountries.has(country)) return false
    const role = getUserPlatformRole(user as any)
    if (criteria.roles.length && !criteria.roles.includes(role)) return false
    const currency = readNestedSetting(user.settings, 'display.currency') || 'KES'
    if (criteria.currencies.length && !criteria.currencies.includes(currency as 'KES' | 'USD')) return false
    const ledger = ledgerSegments.get(user.id) || { hasTraded: false, hasWon: false }
    if (criteria.hasTraded !== null && ledger.hasTraded !== criteria.hasTraded) return false
    if (criteria.hasWon !== null && ledger.hasWon !== criteria.hasWon) return false
    if (criteria.hasDeposited !== null && depositors.has(user.id) !== criteria.hasDeposited) return false
    const activeAt = lastActive.get(user.id) || 0
    if (criteria.activeWithinDays && activeAt < now - criteria.activeWithinDays * 86_400_000) return false
    if (criteria.inactiveForDays && activeAt >= now - criteria.inactiveForDays * 86_400_000) return false
    if (criteria.signedUpAfter && user.createdAt < new Date(criteria.signedUpAfter)) return false
    if (criteria.signedUpBefore && user.createdAt > new Date(criteria.signedUpBefore)) return false
    if (criteria.pushEnabledOnly && !pushUsers.has(user.id)) return false
    return true
  })
}

async function sendNotificationToSubscriptions(notificationId: string, campaignId?: string | null, useAiCopy = true) {
  if (!configureWebPush()) return { delivered: 0, failed: 0 }
  const [notification] = await db.select().from(notifications).where(eq(notifications.id, notificationId)).limit(1)
  if (!notification) return { delivered: 0, failed: 0 }
  const subscriptions = await db.select().from(push_subscriptions).where(and(
    eq(push_subscriptions.user_id, notification.user_id),
    eq(push_subscriptions.enabled, true),
  ))
  const copy = useAiCopy
    ? await rewriteNotificationCopy({ title: notification.title, body: notification.description })
    : { title: notification.title, body: notification.description }
  if (copy.title !== notification.title || copy.body !== notification.description) {
    await db.update(notifications).set({ title: copy.title, description: copy.body }).where(eq(notifications.id, notification.id))
  }
  let delivered = 0
  let failed = 0
  for (const subscription of subscriptions) {
    if (!await shouldDeliverNow(subscription, notification.category)) continue
    const [delivery] = await db.insert(push_deliveries).values({
      notification_id: notification.id,
      subscription_id: subscription.id,
      campaign_id: campaignId || null,
      status: 'sending',
      attempted_at: new Date(),
    }).onConflictDoNothing().returning({ id: push_deliveries.id })
    if (!delivery) continue
    try {
      await webPush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, JSON.stringify({
        title: copy.title,
        body: copy.body,
        url: validInternalLink(notification.link_url || notification.link_target),
        tag: notification.id,
        data: { notificationId: notification.id, category: notification.category },
      }), { TTL: 3600, urgency: notification.category === 'money' || notification.category === 'security' ? 'high' : 'normal' })
      delivered += 1
      await Promise.all([
        db.update(push_deliveries).set({ status: 'delivered', delivered_at: new Date() }).where(eq(push_deliveries.id, delivery.id)),
        db.update(push_subscriptions).set({ failure_count: 0, last_success_at: new Date(), updated_at: new Date() }).where(eq(push_subscriptions.id, subscription.id)),
      ])
    }
    catch (error: any) {
      failed += 1
      const statusCode = Number(error?.statusCode || 0)
      await db.update(push_deliveries).set({ status: 'failed', error_code: statusCode ? String(statusCode) : 'delivery_error' }).where(eq(push_deliveries.id, delivery.id))
      await db.update(push_subscriptions).set({
        failure_count: subscription.failure_count + 1,
        enabled: statusCode === 404 || statusCode === 410 ? false : subscription.enabled,
        updated_at: new Date(),
      }).where(eq(push_subscriptions.id, subscription.id))
    }
  }
  return { delivered, failed }
}

export async function dispatchNotificationCampaign(campaignId: string) {
  const [campaign] = await db.update(notification_campaigns)
    .set({ status: 'sending', updated_at: new Date() })
    .where(and(eq(notification_campaigns.id, campaignId), eq(notification_campaigns.status, 'scheduled')))
    .returning()
  if (!campaign) return null
  const audience = await selectNotificationAudience(notificationAudienceSchema.parse(campaign.criteria))
  const copy = campaign.use_ai_copy
    ? await rewriteNotificationCopy({ title: campaign.title, body: campaign.body })
    : { title: campaign.title, body: campaign.body }
  let delivered = 0
  let failed = 0
  for (const user of audience) {
    const [notification] = await db.insert(notifications).values({
      user_id: user.id,
      category: campaign.category,
      title: copy.title,
      description: copy.body,
      metadata: { campaignId: campaign.id },
      link_type: campaign.link_url ? 'internal' : 'none',
      link_target: campaign.link_url ? validInternalLink(campaign.link_url) : null,
      link_url: campaign.link_url ? validInternalLink(campaign.link_url) : null,
      link_label: campaign.link_url ? 'Open' : null,
    }).returning({ id: notifications.id })
    const result = await sendNotificationToSubscriptions(notification.id, campaign.id, false)
    delivered += result.delivered
    failed += result.failed
  }
  await db.update(notification_campaigns).set({
    status: 'sent',
    sent_at: new Date(),
    audience_count: audience.length,
    delivered_count: delivered,
    failed_count: failed,
    updated_at: new Date(),
  }).where(eq(notification_campaigns.id, campaign.id))
  return { audience: audience.length, delivered, failed }
}

export async function processDueNotificationCampaigns(limit = 10) {
  const campaigns = await db.select({ id: notification_campaigns.id }).from(notification_campaigns).where(and(
    eq(notification_campaigns.status, 'scheduled'),
    or(isNull(notification_campaigns.scheduled_for), lte(notification_campaigns.scheduled_for, new Date())),
  )).orderBy(notification_campaigns.scheduled_for).limit(limit)
  const results = []
  for (const campaign of campaigns) results.push(await dispatchNotificationCampaign(campaign.id))
  return { processed: campaigns.length, results }
}

export async function processNotificationOutbox(limit = 100) {
  const recent = await db.select({ id: notifications.id }).from(notifications).orderBy(desc(notifications.created_at)).limit(limit)
  let delivered = 0
  let failed = 0
  for (const notification of recent) {
    const result = await sendNotificationToSubscriptions(notification.id)
    delivered += result.delivered
    failed += result.failed
  }
  return { scanned: recent.length, delivered, failed }
}

export async function scheduleEngagementNotifications(limit = 100) {
  const activeCutoff = new Date(Date.now() - 3 * 86_400_000)
  const dedupeCutoff = new Date(Date.now() - 7 * 86_400_000)
  const [subscribers, activeRows, recentlyPrompted] = await Promise.all([
    db.select({ userId: push_subscriptions.user_id }).from(push_subscriptions).where(eq(push_subscriptions.enabled, true)),
    db.select({ userId: sessions.user_id }).from(sessions).where(gte(sessions.updated_at, activeCutoff)),
    db.select({ userId: notifications.user_id }).from(notifications).where(and(
      eq(notifications.category, 'engagement'),
      gte(notifications.created_at, dedupeCutoff),
    )),
  ])
  const active = new Set(activeRows.map(row => row.userId))
  const prompted = new Set(recentlyPrompted.map(row => row.userId))
  const candidates = [...new Set(subscribers.map(row => row.userId))]
    .filter(userId => !active.has(userId) && !prompted.has(userId))
    .slice(0, limit)
  if (candidates.length) {
    await db.insert(notifications).values(candidates.map(userId => ({
      user_id: userId,
      category: 'engagement',
      title: 'See what is moving',
      description: 'Catch up on the latest open events when you are ready.',
      metadata: { automation: 'inactive-user', cadenceDays: 7 },
      link_type: 'internal',
      link_target: '/',
      link_url: '/',
      link_label: 'Explore events',
    })))
  }
  return { scheduled: candidates.length }
}

type TradeAffinityRow = {
  userId: string
  conditionId: string
  tradeCount: number
  lastTradedAt: Date
}

function circularHourDistance(first: number, second: number) {
  const distance = Math.abs(first - second)
  return Math.min(distance, 24 - distance)
}

export async function scheduleCategoryAffinityNotifications(limit = 100) {
  const eventCutoff = new Date(Date.now() - 7 * 86_400_000)
  const [eventRows, categoryRows, tradeRows, subscribedRows, dispatchedRows] = await Promise.all([
    db.select({
      id: events.id,
      slug: events.slug,
      title: events.title,
      createdAt: events.created_at,
      categorySlug: tags.slug,
      categoryName: tags.name,
    }).from(events)
      .innerJoin(event_tags, eq(event_tags.event_id, events.id))
      .innerJoin(tags, eq(tags.id, event_tags.tag_id))
      .where(and(
        eq(events.status, 'active'),
        eq(events.is_hidden, false),
        eq(tags.is_main_category, true),
        gte(events.created_at, eventCutoff),
      )),
    db.select({ conditionId: markets.condition_id, categorySlug: tags.slug })
      .from(markets)
      .innerJoin(event_tags, eq(event_tags.event_id, markets.event_id))
      .innerJoin(tags, eq(tags.id, event_tags.tag_id))
      .where(eq(tags.is_main_category, true)),
    loadNotificationLedgerReport<{
      segments: Array<{ userId: string, hasTraded: boolean, hasWon: boolean }>
      affinities: TradeAffinityRow[]
    }>().then(report => report.affinities),
    db.select({ userId: push_subscriptions.user_id }).from(push_subscriptions).where(eq(push_subscriptions.enabled, true)),
    db.select({ eventId: event_notification_dispatches.event_id, userId: event_notification_dispatches.user_id }).from(event_notification_dispatches),
  ])
  const categoryByCondition = new Map(categoryRows.map(row => [row.conditionId, row.categorySlug]))
  const subscribed = new Set(subscribedRows.map(row => row.userId))
  const dispatched = new Set(dispatchedRows.map(row => `${row.eventId}:${row.userId}`))
  const affinities = new Map<string, Map<string, { score: number, lastTradedAt: Date }>>()
  for (const trade of tradeRows) {
    if (!subscribed.has(String(trade.userId))) continue
    const category = categoryByCondition.get(String(trade.conditionId))
    if (!category) continue
    const userId = String(trade.userId)
    const userAffinity = affinities.get(userId) || new Map<string, { score: number, lastTradedAt: Date }>()
    const current = userAffinity.get(category)
    const lastTradedAt = new Date(trade.lastTradedAt)
    userAffinity.set(category, {
      score: (current?.score || 0) + Number(trade.tradeCount || 0),
      lastTradedAt: !current || lastTradedAt > current.lastTradedAt ? lastTradedAt : current.lastTradedAt,
    })
    affinities.set(userId, userAffinity)
  }
  const uniqueEvents = [...new Map(eventRows.map(row => [row.id, row])).values()]
  const nowHourUtc = new Date().getUTCHours()
  let scheduled = 0
  for (const event of uniqueEvents) {
    for (const [userId, userAffinity] of affinities) {
      if (scheduled >= limit || dispatched.has(`${event.id}:${userId}`)) continue
      const ranked = [...userAffinity.entries()].sort((left, right) => right[1].score - left[1].score).slice(0, 3)
      const match = ranked.find(([category]) => category === event.categorySlug)
      if (!match || match[1].score < 2) continue
      if (circularHourDistance(nowHourUtc, match[1].lastTradedAt.getUTCHours()) > 1) continue
      const created = await db.transaction(async (tx) => {
        const [claim] = await tx.insert(event_notification_dispatches).values({
          event_id: event.id,
          user_id: userId,
          category_slug: event.categorySlug,
          affinity_score: match[1].score,
        }).onConflictDoNothing().returning({ id: event_notification_dispatches.id })
        if (!claim) return false
        const [notification] = await tx.insert(notifications).values({
          user_id: userId,
          category: 'market',
          title: `New ${event.categoryName} market`,
          description: `"${event.title}" is now open.`,
          metadata: {
            automation: 'category-affinity',
            eventId: event.id,
            categorySlug: event.categorySlug,
            affinityScore: match[1].score,
            evidence: 'completed-ledger-trades',
          },
          link_type: 'internal',
          link_target: `/event/${event.slug}`,
          link_url: `/event/${event.slug}`,
          link_label: 'View market',
        }).returning({ id: notifications.id })
        await tx.update(event_notification_dispatches).set({ notification_id: notification.id }).where(eq(event_notification_dispatches.id, claim.id))
        return true
      })
      if (created) {
        scheduled += 1
        dispatched.add(`${event.id}:${userId}`)
      }
    }
  }
  return { scannedEvents: uniqueEvents.length, eligibleUsers: affinities.size, scheduled }
}

export const NOTIFICATION_SEND_PERMISSION: StaffPermission = 'community.notification.send'
