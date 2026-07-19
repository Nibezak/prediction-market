/* eslint-disable style/max-statements-per-line */
import type { NextRequest } from 'next/server'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { cacheTags } from '@/lib/cache-tags'
import { UserRepository } from '@/lib/db/queries/user'
import { resolution_approvals, resolution_proposals } from '@/lib/db/schema'
import { conditions, events, markets, outcomes } from '@/lib/db/schema/events/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { db } from '@/lib/drizzle'
import { getUserPlatformRole } from '@/lib/staff-role'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const DEVELOPMENT_SERVICE_SECRET = 'tellwise_super_secret_bypass_key_123'

function getAmmServiceSecret() {
  return process.env.TELLWISE_SECRET?.trim()
    || (process.env.NODE_ENV === 'development' ? DEVELOPMENT_SERVICE_SECRET : '')
}

function getPublicResolutionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/prisma|transaction already closed|transaction api error|invocation/i.test(message)) {
    return 'The ledger was temporarily busy. Please try the resolution again.'
  }
  return message || 'Internal Server Error'
}

const WINNER_MESSAGES = [
  'Your prediction was right and the payout has been credited.',
  'You called it correctly. Your winnings are now in your balance.',
  'The result is in and your winning position has been paid.',
]

const LOSER_MESSAGES = [
  'The market has been resolved. You can review the final outcome.',
  'The final result is available for this market.',
  'This market has now settled. View the event for the outcome details.',
]

function pickResolutionMessage(messages: string[], userId: string) {
  const index = Array.from(userId).reduce((total, character) => total + character.charCodeAt(0), 0) % messages.length
  return messages[index] ?? messages[0] ?? ''
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    const role = getUserPlatformRole(currentUser)
    if (!currentUser || !['ADMIN', 'RESOLVER', 'MODERATOR'].includes(role)) {
      return NextResponse.json({ error: 'Resolution access required.' }, { status: 403 })
    }

    const eventId = req.nextUrl.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 })
    }

    const marketRows = await db.select({ conditionId: markets.condition_id })
      .from(markets)
      .where(eq(markets.event_id, eventId))
    if (marketRows.length === 0) {
      return NextResponse.json({ error: 'No internal AMM markets found for this event.' }, { status: 404 })
    }

    const outcomeRows = await db.select({
      tokenId: outcomes.token_id,
      outcomeText: outcomes.outcome_text,
    })
      .from(outcomes)
      .where(inArray(outcomes.condition_id, marketRows.map(market => market.conditionId)))

    return NextResponse.json({ data: outcomeRows })
  }
  catch (error) {
    console.error('Resolution outcomes API Error:', error)
    return NextResponse.json({ error: 'Failed to load market outcomes.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    const role = getUserPlatformRole(currentUser)
    if (!currentUser || !['ADMIN', 'RESOLVER', 'MODERATOR'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorized. Resolution access required.' }, { status: 403 })
    }

    const payload = await req.json()
    const { eventId, winningTokenId } = payload

    if (!eventId || !winningTokenId) {
      return NextResponse.json({ error: 'eventId and winningTokenId are required.' }, { status: 400 })
    }

    if (role !== 'ADMIN') {
      const governance = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(resolution_proposals).where(and(eq(resolution_proposals.event_id, eventId), eq(resolution_proposals.status, 'pending'))).limit(1)
        if (existing && existing.winning_token_id !== winningTokenId) {
          return { conflict: true, proposal: existing, approvals: 0 }
        }
        const proposal = existing || (await tx.insert(resolution_proposals).values({ event_id: eventId, winning_token_id: winningTokenId, proposed_by_user_id: currentUser.id, evidence_url: typeof payload.supportingLink === 'string' ? payload.supportingLink.slice(0, 1000) : null }).returning())[0]
        await tx.insert(resolution_approvals).values({ proposal_id: proposal.id, approver_user_id: currentUser.id, decision: 'approve', note: typeof payload.note === 'string' ? payload.note.slice(0, 2000) : null }).onConflictDoNothing()
        const approvals = await tx.select({ count: sql<number>`count(*)::int` }).from(resolution_approvals).where(and(eq(resolution_approvals.proposal_id, proposal.id), eq(resolution_approvals.decision, 'approve')))
        return { conflict: false, proposal, approvals: Number(approvals[0]?.count || 0) }
      })
      if (governance.conflict) { return NextResponse.json({ error: 'A different outcome is already awaiting independent approval.' }, { status: 409 }) }
      if (governance.approvals < 2) {
        await recordAuditEvent({ eventType: 'market.resolution.requested', category: 'market', action: 'Resolution submitted for independent approval', actorUserId: currentUser.id, actorRole: role, entityType: 'event', entityId: eventId, metadata: { proposalId: governance.proposal.id, winningTokenId }, ...requestAuditContext(req.headers) })
        return NextResponse.json({ data: { status: 'pending_approval', proposalId: governance.proposal.id, approvals: governance.approvals, required: 2 } }, { status: 202 })
      }
    }

    const eventRows = await db.select().from(events).where(eq(events.id, eventId))
    const event = eventRows[0]

    if (!event) {
      return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
    }
    if (event.status === 'resolved') {
      return NextResponse.json({ error: 'Event is already resolved.' }, { status: 409 })
    }

    const marketRows = await db.select().from(markets).where(eq(markets.event_id, eventId))
    const conditionIds = marketRows.map(m => m.condition_id)

    if (conditionIds.length === 0) {
      return NextResponse.json({ error: 'No markets found for this event.' }, { status: 404 })
    }

    const selectedOutcome = await db.query.outcomes.findFirst({
      where: and(
        inArray(outcomes.condition_id, conditionIds),
        eq(outcomes.token_id, winningTokenId),
      ),
    })
    if (!selectedOutcome) {
      return NextResponse.json({ error: 'The selected outcome does not belong to this event.' }, { status: 400 })
    }

    const ammConditionId = selectedOutcome.condition_id.trim()
    const ammWinningTokenId = String(winningTokenId).trim()

    const serviceSecret = getAmmServiceSecret()
    if (!serviceSecret) {
      return NextResponse.json({ error: 'AMM service authentication is not configured.' }, { status: 503 })
    }

    const serviceHeaders = {
      'content-type': 'application/json',
      'x-tellwise-secret': serviceSecret,
      'x-play-money-api-key': process.env.PLAY_MONEY_SERVICE_API_KEY?.trim() || serviceSecret,
      'x-tellwise-user-id': currentUser.id,
      'x-tellwise-role': role,
      'x-tellwise-is-admin': role === 'ADMIN' ? 'true' : 'false',
      'idempotency-key': `resolve:${eventId}:${winningTokenId}`,
    }

    const syncResponse = await fetch(`${AMM_BASE_URL}/users/sync`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        id: currentUser.id,
        email: currentUser.email,
        username: currentUser.username || currentUser.name || `slimefish_${currentUser.id.slice(0, 8)}`,
        isAdmin: role === 'ADMIN',
        role,
      }),
      cache: 'no-store',
    })
    if (!syncResponse.ok) {
      const syncPayload = await syncResponse.json().catch(() => null)
      return NextResponse.json(
        { error: syncPayload?.error || 'The AMM service could not verify the resolver.' },
        { status: syncResponse.status },
      )
    }

    let ammMarketResponse = await fetch(
      `${AMM_BASE_URL}/markets/${encodeURIComponent(ammConditionId)}?extended=true`,
      { headers: serviceHeaders, cache: 'no-store' },
    )

    if (ammMarketResponse.status === 404) {
      const market = marketRows.find(row => row.condition_id.trim() === ammConditionId)
      const marketOutcomes = await db.select({
        tokenId: outcomes.token_id,
        name: outcomes.outcome_text,
      })
        .from(outcomes)
        .where(eq(outcomes.condition_id, selectedOutcome.condition_id))
        .orderBy(outcomes.outcome_index)

      const legacySyncResponse = await fetch(`${AMM_BASE_URL}/sync/legacy-market`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          id: ammConditionId,
          question: market?.question || market?.title || event.title,
          description: market?.market_rules || event.rules || 'Migrated from the Slimefish internal ledger.',
          closeDate: market?.end_time?.toISOString() || event.end_date?.toISOString() || null,
          options: marketOutcomes.map((outcome, index) => ({
            id: outcome.tokenId.trim(),
            name: outcome.name,
            color: index === 0 ? '#22C55E' : index === 1 ? '#F43F5E' : undefined,
          })),
        }),
        cache: 'no-store',
      })

      if (!legacySyncResponse.ok) {
        const legacySyncPayload = await legacySyncResponse.json().catch(() => null)
        return NextResponse.json(
          { error: legacySyncPayload?.error || 'The legacy market could not be synchronized with the internal AMM.' },
          { status: legacySyncResponse.status >= 500 ? 502 : legacySyncResponse.status },
        )
      }

      ammMarketResponse = await fetch(
        `${AMM_BASE_URL}/markets/${encodeURIComponent(ammConditionId)}?extended=true`,
        { headers: serviceHeaders, cache: 'no-store' },
      )
    }

    if (!ammMarketResponse.ok) {
      const ammError = await ammMarketResponse.json().catch(() => null)
      return NextResponse.json(
        { error: ammError?.error || 'The internal AMM service could not load this market.' },
        { status: ammMarketResponse.status >= 500 ? 502 : ammMarketResponse.status },
      )
    }
    const ammMarketPayload = await ammMarketResponse.json().catch(() => null)
    const ammOptions = ammMarketPayload?.data?.options
    if (!Array.isArray(ammOptions) || !ammOptions.some((option: { id?: string }) => option.id === ammWinningTokenId)) {
      return NextResponse.json(
        { error: 'The selected outcome is not available in the internal AMM market.' },
        { status: 409 },
      )
    }

    const proxyResponse = await fetch(`${AMM_BASE_URL}/markets/${encodeURIComponent(ammConditionId)}/resolve`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ optionId: ammWinningTokenId }),
      cache: 'no-store',
    })
    const proxyPayload = await proxyResponse.json().catch(() => null)
    if (!proxyResponse.ok) {
      return NextResponse.json(
        { error: getPublicResolutionError(proxyPayload?.error || 'The AMM service could not resolve this market.') },
        { status: proxyResponse.status },
      )
    }

    const result = await db.transaction(async (tx) => {
      await tx.update(outcomes)
        .set({ is_winning_outcome: false, payout_value: '0' })
        .where(eq(outcomes.condition_id, selectedOutcome.condition_id))
      await tx.update(outcomes)
        .set({ is_winning_outcome: true, payout_value: '1' })
        .where(and(
          eq(outcomes.condition_id, selectedOutcome.condition_id),
          eq(outcomes.token_id, winningTokenId),
        ))
      await tx.update(markets)
        .set({ is_active: false, is_resolved: true, updated_at: new Date() })
        .where(sql`TRIM(${markets.condition_id}) = ${ammConditionId}`)
      await tx.update(conditions)
        .set({
          resolved: true,
          resolution_status: 'resolved',
          resolution_price: selectedOutcome.outcome_index === 0 ? '1' : '0',
          resolution_last_update: new Date(),
          updated_at: new Date(),
        })
        .where(sql`TRIM(${conditions.id}) = ${ammConditionId}`)

      const remainingMarkets = await tx.select({ conditionId: markets.condition_id })
        .from(markets)
        .where(and(eq(markets.event_id, eventId), eq(markets.is_resolved, false)))

      if (remainingMarkets.length === 0) {
        await tx.update(events)
          .set({ status: 'resolved', resolved_at: new Date() })
          .where(eq(events.id, eventId))
      }

      return { success: true }
    })

    const recipients = Array.isArray(proxyPayload?.data?.recipients)
      ? proxyPayload.data.recipients as Array<{ userId?: string, payout?: number, won?: boolean }>
      : []
    const eventPath = `/event/${event.slug}`
    if (recipients.length > 0) {
      await db.insert(notifications).values(recipients.flatMap((recipient) => {
        const userId = recipient.userId?.trim()
        if (!userId) { return [] }

        const payout = Number(recipient.payout ?? 0)
        const won = recipient.won === true && payout > 0
        const payoutLabel = payout.toFixed(2)
        return [{
          user_id: userId,
          category: 'trade',
          title: won ? `Congratulations - you won $${payoutLabel}` : 'Market resolved',
          description: won
            ? `${pickResolutionMessage(WINNER_MESSAGES, userId)} ${event.title}`
            : `${pickResolutionMessage(LOSER_MESSAGES, userId)} ${event.title}`,
          extra_info: won ? `$${payoutLabel} credited to your balance` : `Outcome: ${selectedOutcome.outcome_text}`,
          metadata: {
            source: 'amm_resolution',
            eventId,
            conditionId: ammConditionId,
            winningTokenId: ammWinningTokenId,
            outcome: selectedOutcome.outcome_text,
            payout,
            won,
          },
          link_type: 'event',
          link_target: eventPath,
          link_url: eventPath,
          link_label: 'View resolved market',
        }]
      }))

      recipients.forEach((recipient) => {
        if (recipient.userId) { revalidateTag(cacheTags.notifications(recipient.userId), 'max') }
      })
    }

    revalidateTag(cacheTags.event(event.slug), 'max')
    revalidateTag(cacheTags.eventsList, 'max')
    revalidateTag(cacheTags.homeFeaturedEvents, 'max')

    await recordAuditEvent({ eventType: 'market.resolved', category: 'market', action: `Resolved market as ${selectedOutcome.outcome_text}`, actorUserId: currentUser.id, actorRole: role, entityType: 'event', entityId: eventId, metadata: { conditionId: ammConditionId, winningTokenId: ammWinningTokenId, outcome: selectedOutcome.outcome_text, recipients: recipients.length }, ...requestAuditContext(req.headers) })
    await db.update(resolution_proposals).set({ status: 'executed', finalized_at: new Date() }).where(and(eq(resolution_proposals.event_id, eventId), eq(resolution_proposals.status, 'pending')))

    return NextResponse.json(result)
  }
  catch (error: any) {
    console.error('Resolution API Error:', error)
    await recordAuditEvent({ eventType: 'market.payout.failed', category: 'market', action: 'Market resolution failed', outcome: 'failure', severity: 'high', metadata: { reason: getPublicResolutionError(error) }, ...requestAuditContext(req.headers) })
    return NextResponse.json({ error: getPublicResolutionError(error) }, { status: 500 })
  }
}
