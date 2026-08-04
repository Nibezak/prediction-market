import { sql } from 'drizzle-orm'
import { char, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const payment_intents = pgTable('payment_intents', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  user_id: text().notNull(),
  direction: text().notNull(),
  status: text().notNull().default('created'),
  settlement_adapter: text().notNull().default('slimefish_backend'),
  source_currency: text().notNull(),
  destination_currency: text().notNull(),
  gross_amount: numeric({ precision: 20, scale: 2 }).notNull(),
  provider_fee: numeric({ precision: 20, scale: 2 }).notNull().default('0'),
  platform_fee: numeric({ precision: 20, scale: 8 }).notNull().default('0'),
  net_amount: numeric({ precision: 20, scale: 2 }).notNull(),
  idempotency_key: text().notNull(),
  external_reference: text(),
  ledger_transaction_id: text(),
  failure_code: text(),
  failure_message: text(),
  metadata: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp({ withTimezone: true }),
  expires_at: timestamp({ withTimezone: true }),
}, table => ({
  idempotencyIdx: uniqueIndex('idx_payment_intents_idempotency').on(table.idempotency_key),
  userIdx: index('idx_payment_intents_user').on(table.user_id, table.created_at),
  queueIdx: index('idx_payment_intents_queue').on(table.status, table.created_at),
}))

export const payment_events = pgTable('payment_events', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  payment_intent_id: char('payment_intent_id', { length: 26 }).notNull().references(() => payment_intents.id, { onDelete: 'restrict' }),
  event_type: text().notNull(),
  from_status: text(),
  to_status: text().notNull(),
  actor_type: text().notNull().default('system'),
  actor_id: text(),
  payload: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  occurred_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => ({ intentIdx: index('idx_payment_events_intent').on(table.payment_intent_id, table.occurred_at) }))

export const provider_webhook_events = pgTable('provider_webhook_events', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  provider: text().notNull(),
  provider_event_id: text().notNull(),
  event_type: text().notNull(),
  payment_intent_id: char('payment_intent_id', { length: 26 }).references(() => payment_intents.id, { onDelete: 'restrict' }),
  payload_hash: text().notNull(),
  signature_digest: text().notNull(),
  status: text().notNull().default('received'),
  failure_message: text(),
  received_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  processed_at: timestamp({ withTimezone: true }),
}, table => ({
  providerEventIdx: uniqueIndex('idx_provider_webhook_event').on(table.provider, table.provider_event_id),
  intentIdx: index('idx_provider_webhook_intent').on(table.payment_intent_id, table.received_at),
}))

export const payment_disputes = pgTable('payment_disputes', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  payment_intent_id: char('payment_intent_id', { length: 26 }).notNull().references(() => payment_intents.id, { onDelete: 'restrict' }),
  provider: text().notNull(),
  provider_dispute_id: text().notNull(),
  status: text().notNull().default('open'),
  amount: numeric({ precision: 20, scale: 2 }).notNull(),
  reason: text(),
  evidence: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  opened_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  closed_at: timestamp({ withTimezone: true }),
}, table => ({
  providerDisputeIdx: uniqueIndex('idx_payment_disputes_provider').on(table.provider, table.provider_dispute_id),
  intentIdx: index('idx_payment_disputes_intent').on(table.payment_intent_id, table.opened_at),
}))

export const reconciliation_runs = pgTable('reconciliation_runs', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  adapter: text().notNull(),
  provider_report_id: text(),
  report_hash: text(),
  status: text().notNull().default('running'),
  checked_count: integer().notNull().default(0),
  mismatch_count: integer().notNull().default(0),
  details: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  started_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp({ withTimezone: true }),
}, table => ({ providerReportIdx: uniqueIndex('idx_reconciliation_provider_report').on(table.adapter, table.provider_report_id) }))

export const sanctions_screenings = pgTable('sanctions_screenings', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  user_id: text().notNull(),
  status: text().notNull().default('pending'),
  provider: text().notNull().default('manual'),
  query_hash: text().notNull(),
  match_score: integer(),
  matched_records: jsonb().$type<Record<string, unknown>[]>().notNull().default(sql`'[]'::jsonb`),
  reviewed_by_user_id: text(),
  review_note: text(),
  screened_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp({ withTimezone: true }).notNull(),
}, table => ({ userIdx: index('idx_sanctions_screenings_user').on(table.user_id, table.screened_at) }))

export const report_requests = pgTable('report_requests', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  user_id: text().notNull(),
  report_type: text().notNull(),
  status: text().notNull().default('pending'),
  format: text().notNull().default('json'),
  storage_url: text(),
  checksum: text(),
  expires_at: timestamp({ withTimezone: true }),
  requested_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  completed_at: timestamp({ withTimezone: true }),
}, table => ({ userIdx: index('idx_report_requests_user').on(table.user_id, table.requested_at) }))

export const retention_policies = pgTable('retention_policies', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  data_class: text().notNull().unique(),
  retention_days: integer().notNull(),
  legal_basis: text().notNull(),
  deletion_mode: text().notNull().default('anonymize'),
  updated_by_user_id: text(),
  updated_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
})

export const resolution_proposals = pgTable('resolution_proposals', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  event_id: text().notNull(),
  winning_token_id: text().notNull(),
  status: text().notNull().default('pending'),
  proposed_by_user_id: text().notNull(),
  evidence_url: text(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finalized_at: timestamp({ withTimezone: true }),
}, table => ({ pendingIdx: uniqueIndex('idx_resolution_proposals_pending').on(table.event_id, table.status) }))

export const resolution_approvals = pgTable('resolution_approvals', {
  id: char('id', { length: 26 }).primaryKey().default(sql`generate_ulid()`),
  proposal_id: char('proposal_id', { length: 26 }).notNull().references(() => resolution_proposals.id, { onDelete: 'restrict' }),
  approver_user_id: text().notNull(),
  decision: text().notNull().default('approve'),
  note: text(),
  created_at: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, table => ({ approverIdx: uniqueIndex('idx_resolution_approvals_approver').on(table.proposal_id, table.approver_user_id) }))
