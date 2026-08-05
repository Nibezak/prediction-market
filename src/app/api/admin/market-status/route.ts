import type { NextRequest } from 'next/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
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

  // Update markets directly in DB
  const statusUrl = `${AMM_BASE_URL}/sync/market-status`
  const statusBody = JSON.stringify({ eventId, marketIds, status: 'closed' })
  
  console.log('[Market Close] Attempting to close markets:', { eventId, marketIds, statusUrl })
  
  const closedAt = new Date()
  let ammClosed = false

  try {
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
      signal: AbortSignal.timeout(15_000),
    }).catch(err => {
      console.warn('[Market Close] AMM fetch failed (will proceed with DB update):', err)
      return null
    })
    
    if (ammResponse && ammResponse.ok) {
      ammClosed = true
    }
  } catch (error) {
    console.warn('[Market Close] AMM request error (proceeding with local DB close):', error)
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(markets).set({
        is_active: false,
        end_time: sql`COALESCE(${markets.end_time}, NOW())`,
        updated_at: sql`NOW()`,
      }).where(inArray(markets.condition_id, marketIds))

      if (event.status !== 'closed') {
        await tx.update(events).set({
          status: 'closed',
          active_markets_count: 0,
          end_date: sql`COALESCE(${events.end_date}, NOW())`,
          updated_at: sql`NOW()`,
        }).where(eq(events.id, eventId))
      }
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
      metadata: { marketIds, reason: 'manual_integrity_close', ammClosed },
      ...requestAuditContext(request.headers),
    }).catch(() => null)

    return NextResponse.json({ success: true, closedAt: closedAt.toISOString() })
  } catch (dbError: any) {
    console.error('[Market Close] DB update error:', dbError)
    return NextResponse.json({ error: `Failed to close market: ${dbError?.message || 'Database update error'}` }, { status: 500 })
  }
}
