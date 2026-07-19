/* eslint-disable style/max-statements-per-line */
import { createHash } from 'node:crypto'
import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { audit_events, payment_intents, report_requests, withdrawal_requests } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { enforceRateLimit } from '@/lib/security/rate-limit'

function csvCell(value: unknown) {
  let text = value == null ? '' : typeof value === 'string' ? value : JSON.stringify(value)
  if (/^[=+\-@]/.test(text)) { text = `'${text}` }
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() }).catch(() => null)
  if (!session?.user?.id) { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  await enforceRateLimit({ scope: 'user-report', identifier: session.user.id, limit: 5, windowSeconds: 3600 })
  const url = new URL(request.url)
  const format = url.searchParams.get('format') === 'csv' ? 'csv' : 'json'
  const from = new Date(url.searchParams.get('from') || Date.now() - 365 * 24 * 60 * 60 * 1000)
  const to = new Date(url.searchParams.get('to') || Date.now())
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from > to || to.getTime() - from.getTime() > 7 * 365 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Invalid report date range' }, { status: 400 })
  }
  const [audit, payments, withdrawals] = await Promise.all([
    db.select().from(audit_events).where(and(eq(audit_events.subject_user_id, session.user.id), gte(audit_events.occurred_at, from), lte(audit_events.occurred_at, to))).orderBy(desc(audit_events.occurred_at)).limit(10_000),
    db.select().from(payment_intents).where(and(eq(payment_intents.user_id, session.user.id), gte(payment_intents.created_at, from), lte(payment_intents.created_at, to))).orderBy(desc(payment_intents.created_at)).limit(10_000),
    db.select().from(withdrawal_requests).where(and(eq(withdrawal_requests.user_id, session.user.id), gte(withdrawal_requests.requested_at, from), lte(withdrawal_requests.requested_at, to))).orderBy(desc(withdrawal_requests.requested_at)).limit(10_000),
  ])
  const report = { generatedAt: new Date().toISOString(), period: { from: from.toISOString(), to: to.toISOString() }, userId: session.user.id, payments, withdrawals, auditEvents: audit }
  const content = format === 'csv'
    ? [['timestamp', 'category', 'action', 'outcome', 'entityType', 'entityId', 'metadata'].map(csvCell).join(','), ...audit.map(row => [row.occurred_at.toISOString(), row.category, row.action, row.outcome, row.entity_type, row.entity_id, row.metadata].map(csvCell).join(','))].join('\r\n')
    : JSON.stringify(report, null, 2)
  const checksum = createHash('sha256').update(content).digest('hex')
  const [reportRequest] = await db.insert(report_requests).values({ user_id: session.user.id, report_type: 'account_activity', status: 'completed', format, checksum, completed_at: new Date(), expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }).returning()
  await recordAuditEvent({ eventType: 'user.data.exported', category: 'user', action: 'User downloaded account activity report', actorUserId: session.user.id, subjectUserId: session.user.id, entityType: 'report_request', entityId: reportRequest.id, metadata: { format, checksum, from: from.toISOString(), to: to.toISOString() }, ...requestAuditContext(request.headers) })
  return new NextResponse(content, { headers: { 'content-type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="slimefish-account-report.${format}"`, 'cache-control': 'private, no-store', 'x-content-sha256': checksum } })
}
