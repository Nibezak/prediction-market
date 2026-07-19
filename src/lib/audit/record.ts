import { audit_events } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import type { AuditCategory, AuditEventType } from './catalog'

const SENSITIVE_KEY = /authorization|cookie|password|passphrase|secret|token|signature|private|credential/i

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[depth-limited]'
  if (Array.isArray(value)) return value.slice(0, 100).map(item => sanitize(item, depth + 1))
  if (!value || typeof value !== 'object') return typeof value === 'string' ? value.slice(0, 4000) : value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1),
  ]))
}

export type AuditEventInput = {
  eventType: AuditEventType
  category: AuditCategory
  action: string
  outcome?: 'success' | 'failure' | 'denied' | 'pending'
  severity?: 'info' | 'warning' | 'high' | 'critical'
  actorUserId?: string | null
  actorRole?: string | null
  subjectUserId?: string | null
  entityType?: string | null
  entityId?: string | null
  requestId?: string | null
  correlationId?: string | null
  idempotencyKey?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  riskScore?: number | null
  metadata?: Record<string, unknown>
  beforeValues?: Record<string, unknown> | null
  afterValues?: Record<string, unknown> | null
}

export async function recordAuditEvent(input: AuditEventInput) {
  try {
    await db.insert(audit_events).values({
      event_type: input.eventType,
      category: input.category,
      action: input.action.slice(0, 500),
      outcome: input.outcome || 'success',
      severity: input.severity || 'info',
      actor_user_id: input.actorUserId || null,
      actor_role: input.actorRole || null,
      subject_user_id: input.subjectUserId || null,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      request_id: input.requestId || null,
      correlation_id: input.correlationId || null,
      idempotency_key: input.idempotencyKey || null,
      ip_address: input.ipAddress || null,
      user_agent: input.userAgent || null,
      risk_score: input.riskScore ?? null,
      metadata: sanitize(input.metadata || {}) as Record<string, unknown>,
      before_values: sanitize(input.beforeValues) as Record<string, unknown> | null,
      after_values: sanitize(input.afterValues) as Record<string, unknown> | null,
    })
  }
  catch (error) {
    // Auditing must never break the user action, but failures stay visible to operators.
    console.error('Failed to append audit event', input.eventType, error)
  }
}

export function requestAuditContext(headers: Headers) {
  return {
    requestId: headers.get('x-request-id') || headers.get('x-vercel-id'),
    ipAddress: headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip'),
    userAgent: headers.get('user-agent'),
  }
}
