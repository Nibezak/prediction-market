import type { NextRequest } from 'next/server'
import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { UserRepository } from '@/lib/db/queries/user'
import { events, markets, outcomes } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { getUserPlatformRole } from '@/lib/staff-role'
import { hasStaffPermission } from '@/lib/staff-permissions'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

export async function POST(request: NextRequest) {
  const currentUser = await UserRepository.getCurrentUser({ minimal: true })
  const role = getUserPlatformRole(currentUser)
  if (!currentUser || !hasStaffPermission(currentUser, 'markets.close')) {
    return NextResponse.json({ error: 'You do not have permission to close markets.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null) as { eventId?: unknown, status?: unknown } | null
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  if (!eventId || body?.status !== 'closed') {
    return NextResponse.json({ error: 'A valid event and closed status are required.' }, { status: 400 })
  }

  const eventRows = await db
    .select({
      id: events.id,
      title: events.title,
      status: events.status,
      rules: events.rules,
      endDate: events.end_date,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1)
  const event = eventRows[0]
  if (!event) {
    return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
  }
  if (event.status === 'resolved') {
    return NextResponse.json({ error: 'Resolved markets cannot be closed again.' }, { status: 409 })
  }
  if (event.status === 'closed') {
    return NextResponse.json({ success: true, alreadyClosed: true })
  }

  const marketRows = await db
    .select({
      conditionId: markets.condition_id,
      title: markets.title,
      question: markets.question,
      rules: markets.market_rules,
      endTime: markets.end_time,
    })
    .from(markets)
    .where(eq(markets.event_id, eventId))
  const marketIds = marketRows.map(row => row.conditionId.trim()).filter(Boolean)
  if (marketIds.length === 0) {
    return NextResponse.json({ error: 'This event has no internal AMM markets.' }, { status: 409 })
  }

  const serviceKey = process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim() || process.env.TELLWISE_SECRET?.trim()
  if (!serviceKey) {
    return NextResponse.json({ error: 'AMM service authentication is not configured.' }, { status: 503 })
  }

  const serviceHeaders = {
    'content-type': 'application/json',
    'x-tellwise-secret': process.env.TELLWISE_SECRET?.trim() || serviceKey,
  }
  const outcomeRows = await db.select({
    conditionId: outcomes.condition_id,
    tokenId: outcomes.token_id,
    name: outcomes.outcome_text,
    index: outcomes.outcome_index,
  }).from(outcomes).where(inArray(outcomes.condition_id, marketIds))

  for (const market of marketRows) {
    const marketOutcomes = outcomeRows
      .filter(outcome => outcome.conditionId === market.conditionId)
      .sort((left, right) => left.index - right.index)
    
    // Skip legacy market sync for AMM - it's disabled
    // The AMM backend should handle market closing directly
    const syncUrl = `${AMM_BASE_URL}/sync/legacy-market`
    const syncBody = JSON.stringify({
      id: market.conditionId.trim(),
      question: market.question?.trim() || market.title,
      description: market.rules?.trim() || event.rules?.trim() || 'Slimefish internal market.',
      closeDate: market.endTime?.toISOString() || event.endDate?.toISOString() || null,
      options: marketOutcomes.map((outcome, index) => ({
        id: outcome.tokenId.trim(),
        name: outcome.name,
        color: index === 0 ? '#22C55E' : '#F43F5E',
      })),
    })
    
    // Try to sync, but don't fail if legacy sync is disabled
    try {
      const syncResponse = await fetch(syncUrl, {
        method: 'POST',
        headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: serviceHeaders }),
        body: syncBody,
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null)
      
      if (syncResponse && !syncResponse.ok) {
        const syncPayload = await syncResponse.json().catch(() => null) as { error?: string } | null
        // If legacy sync is disabled, log warning but continue
        if (syncPayload?.error?.includes('Legacy market synchronization is disabled')) {
          console.warn('Legacy market sync disabled, proceeding with AMM close')
        } else {
          return NextResponse.json({ error: syncPayload?.error || 'The internal market could not be synchronized.' }, { status: syncResponse.status })
        }
      }
    } catch (error) {
      console.warn('Legacy market sync failed, proceeding with AMM close:', error)
    }
  }

  const statusUrl = `${AMM_BASE_URL}/sync/market-status`
  const statusBody = JSON.stringify({ eventId, marketIds, status: 'closed' })
  const ammResponse = await fetch(statusUrl, {
    method: 'POST',
    headers: signSlimefishBackendRequest({
      url: statusUrl,
      method: 'POST',
      body: statusBody,
      headers: {
      ...serviceHeaders,
      'x-request-id': request.headers.get('x-request-id') || crypto.randomUUID(),
      },
    }),
    body: statusBody,
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!ammResponse) {
    return NextResponse.json({ error: 'The AMM service could not be reached.' }, { status: 502 })
  }
  const ammPayload = await ammResponse.json().catch(() => null) as { error?: string, closedAt?: string } | null
  if (!ammResponse.ok) {
    return NextResponse.json({ error: ammPayload?.error || 'The AMM service could not close this market.' }, { status: ammResponse.status })
  }

  const closedAt = ammPayload?.closedAt ? new Date(ammPayload.closedAt) : new Date()
  await db.transaction(async (tx) => {
    await tx.update(markets).set({ is_active: false, end_time: closedAt, updated_at: closedAt })
      .where(inArray(markets.condition_id, marketIds))
    await tx.update(events).set({ status: 'closed', end_date: closedAt, active_markets_count: 0, updated_at: closedAt })
      .where(and(eq(events.id, eventId), eq(events.status, event.status)))
  })

  await recordAuditEvent({
    eventType: 'market.closed',
    category: 'market',
    action: `Closed market: ${event.title}`,
    severity: 'warning',
    actorUserId: currentUser.id,
    actorRole: role,
    entityType: 'event',
    entityId: eventId,
    beforeValues: { status: event.status },
    afterValues: { status: 'closed', closedAt: closedAt.toISOString() },
    metadata: { marketIds, reason: 'manual_integrity_close' },
    ...requestAuditContext(request.headers),
  })

  return NextResponse.json({ success: true, closedAt: closedAt.toISOString() })
}
