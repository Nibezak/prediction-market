import { sql } from 'drizzle-orm'
import { boolean, char, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'
import { users } from '@/lib/db/schema/auth/tables'
import { events } from '@/lib/db/schema/events/tables'

export const notifications = pgTable(
  'notifications',
  {
    id: char('id', { length: 26 })
      .primaryKey()
      .default(sql`generate_ulid()`),
    user_id: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    category: text()
      .notNull(),
    title: text()
      .notNull(),
    description: text()
      .notNull(),
    extra_info: text(),
    metadata: jsonb()
      .notNull()
      .default(sql`'{}'::JSONB`),
    link_type: text()
      .notNull()
      .default('none'),
    link_target: text(),
    link_url: text(),
    link_label: text(),
    created_at: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow(),
    read_at: timestamp({ withTimezone: true }),
  },
)

export const push_subscriptions = pgTable('push_subscriptions', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  user_id: text().notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  endpoint: text().notNull(),
  p256dh: text().notNull(),
  auth: text().notNull(),
  platform: text().notNull().default('web'),
  user_agent: text(),
  locale: text().notNull().default('en'),
  timezone: text(),
  enabled: boolean().notNull().default(true),
  failure_count: integer().notNull().default(0),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  last_success_at: timestamp({ withTimezone: true }),
}, table => ({
  endpointUnique: unique('push_subscriptions_endpoint_key').on(table.endpoint),
  userEnabledIndex: index('push_subscriptions_user_enabled_idx').on(table.user_id, table.enabled),
}))

export const notification_campaigns = pgTable('notification_campaigns', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  created_by_user_id: text().notNull().references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  title: text().notNull(),
  body: text().notNull(),
  category: text().notNull().default('platform'),
  link_url: text(),
  criteria: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  use_ai_copy: boolean().notNull().default(true),
  status: text().notNull().default('draft'),
  scheduled_for: timestamp({ withTimezone: true }),
  sent_at: timestamp({ withTimezone: true }),
  audience_count: integer().notNull().default(0),
  delivered_count: integer().notNull().default(0),
  failed_count: integer().notNull().default(0),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => ({
  statusScheduleIndex: index('notification_campaigns_status_schedule_idx').on(table.status, table.scheduled_for),
}))

export const push_deliveries = pgTable('push_deliveries', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  notification_id: char('notification_id', { length: 26 }).notNull().references(() => notifications.id, { onDelete: 'cascade' }),
  subscription_id: char('subscription_id', { length: 26 }).notNull().references(() => push_subscriptions.id, { onDelete: 'cascade' }),
  campaign_id: char('campaign_id', { length: 26 }).references(() => notification_campaigns.id, { onDelete: 'set null' }),
  status: text().notNull().default('pending'),
  error_code: text(),
  attempted_at: timestamp({ withTimezone: true }),
  delivered_at: timestamp({ withTimezone: true }),
  opened_at: timestamp({ withTimezone: true }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => ({
  notificationSubscriptionUnique: unique('push_deliveries_notification_subscription_key').on(table.notification_id, table.subscription_id),
  statusIndex: index('push_deliveries_status_idx').on(table.status),
}))

export const event_notification_dispatches = pgTable('event_notification_dispatches', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  event_id: char('event_id', { length: 26 }).notNull().references(() => events.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  user_id: text().notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  category_slug: text().notNull(),
  affinity_score: integer().notNull(),
  notification_id: char('notification_id', { length: 26 }).references(() => notifications.id, { onDelete: 'set null' }),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => ({
  eventUserUnique: unique('event_notification_dispatches_event_user_key').on(table.event_id, table.user_id),
  userCreatedIndex: index('event_notification_dispatches_user_created_idx').on(table.user_id, table.created_at),
}))
