/* eslint-disable style/max-statements-per-line */
import type { NextRequest } from 'next/server'
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { cacheTags } from '@/lib/cache-tags'
import { UserRepository } from '@/lib/db/queries/user'
import { resolution_approvals, resolution_proposals } from '@/lib/db/schema'
import { conditions, event_creations, events, markets, outcomes } from '@/lib/db/schema/events/tables'
import { notifications } from '@/lib/db/schema/notifications/tables'
import { db } from '@/lib/drizzle'
import { getUserPlatformRole } from '@/lib/staff-role'
import { hasStaffPermission } from '@/lib/staff-permissions'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const DEVELOPMENT_SERVICE_SECRET = 'tellwise_super_secret_bypass_key_123'

function normalizeStoredId(value: string | null | undefined) {
  return value?.trim() ?? ''
}

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

class AmmResolutionError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function getEventResolutionType(eventId: string, marketCount: number) {
  if (marketCount <= 1) {
    return 'binary' as const
  }

  const [creation] = await db.select({ marketMode: event_creations.market_mode })
    .from(event_creations)
    .where(or(
      eq(event_creations.source_event_id, eventId),
      eq(event_creations.deployed_event_id, eventId),
    ))
    .orderBy(desc(event_creations.updated_at))
    .limit(1)

  return creation?.marketMode === 'multi_multiple'
    ? 'multiple-winner' as const
    : 'single-winner' as const
}

async function resolveInternalAmmMarket({
  event,
  market,
  winningOutcome,
  serviceHeaders,
}: {
  event: typeof events.$inferSelect
  market: typeof markets.$inferSelect
  winningOutcome: typeof outcomes.$inferSelect
  serviceHeaders: Record<string, string>
}) {
  const conditionId = market.condition_id.trim()
  const winningTokenId = winningOutcome.token_id.trim()
  const marketUrl = `${AMM_BASE_URL}/markets/${encodeURIComponent(conditionId)}?extended=true`
  let marketResponse = await fetch(
    marketUrl,
    { headers: signSlimefishBackendRequest({ url: marketUrl, headers: serviceHeaders }), cache: 'no-store' },
  )

  if (marketResponse.status === 404) {
    const marketOutcomes = await db.select({
      tokenId: outcomes.token_id,
      name: outcomes.outcome_text,
      index: outcomes.outcome_index,
    })
      .from(outcomes)
      .where(eq(outcomes.condition_id, market.condition_id))
      .orderBy(outcomes.outcome_index)

    const syncUrl = `${AMM_BASE_URL}/sync/legacy-market`
    const syncBody = JSON.stringify({
      id: conditionId,
      question: market.question || market.title || event.title,
      description: market.market_rules || event.rules || 'Migrated from the Slimefish internal ledger.',
      closeDate: market.end_time?.toISOString() || event.end_date?.toISOString() || null,
      options: marketOutcomes.map((outcome, index) => ({
        id: outcome.tokenId.trim(),
        name: outcome.name,
        color: index === 0 ? '#22C55E' : '#F43F5E',
      })),
    })
    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: serviceHeaders }),
      body: syncBody,
      cache: 'no-store',
    })
    if (!syncResponse.ok) {
      const payload = await syncResponse.json().catch(() => null)
      throw new AmmResolutionError(
        payload?.error || 'The legacy market could not be synchronized with the internal AMM.',
        syncResponse.status >= 500 ? 502 : syncResponse.status,
      )
    }

    marketResponse = await fetch(
      marketUrl,
      { headers: signSlimefishBackendRequest({ url: marketUrl, headers: serviceHeaders }), cache: 'no-store' },
    )
  }

  if (!marketResponse.ok) {
    const payload = await marketResponse.json().catch(() => null)
    throw new AmmResolutionError(
      payload?.error || 'The internal AMM service could not load this market.',
      marketResponse.status >= 500 ? 502 : marketResponse.status,
    )
  }

  const marketPayload = await marketResponse.json().catch(() => null)
  if (!Array.isArray(marketPayload?.data?.options)
    || !marketPayload.data.options.some((option: { id?: string }) => option.id === winningTokenId)) {
    throw new AmmResolutionError('The selected outcome is not available in the internal AMM market.', 409)
  }

  const resolveUrl = `${AMM_BASE_URL}/markets/${encodeURIComponent(conditionId)}/resolve`
  const resolveBody = JSON.stringify({ optionId: winningTokenId })
  const response = await fetch(resolveUrl, {
    method: 'POST',
    headers: signSlimefishBackendRequest({
      url: resolveUrl,
      method: 'POST',
      body: resolveBody,
      headers: {
      ...serviceHeaders,
      'idempotency-key': `resolve:${event.id}:${conditionId}:${winningTokenId}`,
      },
    }),
    body: resolveBody,
    cache: 'no-store',
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new AmmResolutionError(
      getPublicResolutionError(payload?.error || 'The AMM service could not resolve this market.'),
      response.status,
    )
  }

  return payload
}

export async function GET(req: NextRequest) {
  try {
    const currentUser = await UserRepository.getCurrentUser({ minimal: true })
    if (!currentUser || !hasStaffPermission(currentUser, 'markets.resolve')) {
      return NextResponse.json({ error: 'Resolution access required.' }, { status: 403 })
    }

    const eventId = req.nextUrl.searchParams.get('eventId')
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required.' }, { status: 400 })
    }

    const marketRows = await db.select({
      conditionId: markets.condition_id,
      title: markets.title,
      shortTitle: markets.short_title,
    })
      .from(markets)
      .where(eq(markets.event_id, eventId))
    if (marketRows.length === 0) {
      return NextResponse.json({ error: 'No internal AMM markets found for this event.' }, { status: 404 })
    }

    const outcomeRows = await db.select({
      conditionId: outcomes.condition_id,
      tokenId: outcomes.token_id,
      outcomeText: outcomes.outcome_text,
      outcomeIndex: outcomes.outcome_index,
    })
      .from(outcomes)
      .where(inArray(outcomes.condition_id, marketRows.map(market => market.conditionId)))

    const resolutionType = await getEventResolutionType(eventId, marketRows.length)
    if (resolutionType !== 'binary') {
      const candidateOutcomes = marketRows.flatMap((market) => {
        const marketConditionId = normalizeStoredId(market.conditionId)
        const marketOutcomes = outcomeRows.filter(
          outcome => normalizeStoredId(outcome.conditionId) === marketConditionId,
        )
        const yesOutcome = marketOutcomes.find(outcome => outcome.outcomeText.trim().toLowerCase() === 'yes')
          ?? marketOutcomes.find(outcome => outcome.outcomeIndex === 0)
          ?? marketOutcomes.toSorted((first, second) => first.outcomeIndex - second.outcomeIndex)[0]
        const tokenId = yesOutcome?.tokenId?.trim()
        const outcomeText = market.shortTitle?.trim() || market.title.trim()
        if (!tokenId || !outcomeText) {
          return []
        }
        return [{
          tokenId,
          outcomeText,
        }]
      })
      if (candidateOutcomes.length === 0) {
        return NextResponse.json({ error: 'No resolvable outcomes were found for this event.' }, { status: 409 })
      }
      return NextResponse.json({ data: candidateOutcomes, resolutionType })
    }

    return NextResponse.json({
      data: outcomeRows.map(outcome => ({
        tokenId: normalizeStoredId(outcome.tokenId),
        outcomeText: outcome.outcomeText,
      })),
      resolutionType,
    })
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
    if (!currentUser || !hasStaffPermission(currentUser, 'markets.resolve')) {
      return NextResponse.json({ error: 'Unauthorized. Resolution access required.' }, { status: 403 })
    }

    const payload = await req.json() as Record<string, unknown>
    const { eventId } = payload
    const requestedWinningTokenIds: string[] = Array.from(new Set<string>(
      (Array.isArray(payload.winningTokenIds) ? payload.winningTokenIds : [payload.winningTokenId])
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map(value => value.trim()),
    ))

    if (typeof eventId !== 'string' || !eventId || requestedWinningTokenIds.length === 0) {
      return NextResponse.json({ error: 'eventId and at least one winning outcome are required.' }, { status: 400 })
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

    const allEventOutcomes = await db.select().from(outcomes)
      .where(inArray(outcomes.condition_id, conditionIds))
    const resolutionType = await getEventResolutionType(eventId, marketRows.length)
    const candidateTokenIds = resolutionType === 'binary'
      ? new Set(allEventOutcomes.map(outcome => outcome.token_id.trim()))
      : new Set(marketRows.flatMap((market) => {
          const candidate = allEventOutcomes.find(outcome => (
            normalizeStoredId(outcome.condition_id) === normalizeStoredId(market.condition_id)
            && outcome.outcome_index === 0
          ))
          return candidate ? [candidate.token_id.trim()] : []
        }))

    if (requestedWinningTokenIds.some(tokenId => !candidateTokenIds.has(tokenId))) {
      return NextResponse.json({ error: 'A selected outcome does not belong to this event.' }, { status: 400 })
    }
    if (resolutionType !== 'multiple-winner' && requestedWinningTokenIds.length !== 1) {
      return NextResponse.json({ error: 'This market allows exactly one winning outcome.' }, { status: 400 })
    }

    const canonicalWinningTokenIds = requestedWinningTokenIds.toSorted()
    const governanceWinningTokenId: string = canonicalWinningTokenIds.length === 1
      ? canonicalWinningTokenIds[0]!
      : JSON.stringify(canonicalWinningTokenIds)

    if (role !== 'ADMIN') {
      const governance = await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(resolution_proposals).where(and(eq(resolution_proposals.event_id, eventId), eq(resolution_proposals.status, 'pending'))).limit(1)
        if (existing && existing.winning_token_id !== governanceWinningTokenId) {
          return { conflict: true, proposal: existing, approvals: 0 }
        }
        const proposal = existing || (await tx.insert(resolution_proposals).values({ event_id: eventId, winning_token_id: governanceWinningTokenId, proposed_by_user_id: currentUser.id, evidence_url: typeof payload.supportingLink === 'string' ? payload.supportingLink.slice(0, 1000) : null }).returning())[0]
        await tx.insert(resolution_approvals).values({ proposal_id: proposal.id, approver_user_id: currentUser.id, decision: 'approve', note: typeof payload.note === 'string' ? payload.note.slice(0, 2000) : null }).onConflictDoNothing()
        const approvals = await tx.select({ count: sql<number>`count(*)::int` }).from(resolution_approvals).where(and(eq(resolution_approvals.proposal_id, proposal.id), eq(resolution_approvals.decision, 'approve')))
        return { conflict: false, proposal, approvals: Number(approvals[0]?.count || 0) }
      })
      if (governance.conflict) { return NextResponse.json({ error: 'A different outcome is already awaiting independent approval.' }, { status: 409 }) }
      if (governance.approvals < 2) {
        await recordAuditEvent({ eventType: 'market.resolution.requested', category: 'market', action: 'Resolution submitted for independent approval', actorUserId: currentUser.id, actorRole: role, entityType: 'event', entityId: eventId, metadata: { proposalId: governance.proposal.id, winningTokenIds: canonicalWinningTokenIds }, ...requestAuditContext(req.headers) })
        return NextResponse.json({ data: { status: 'pending_approval', proposalId: governance.proposal.id, approvals: governance.approvals, required: 2 } }, { status: 202 })
      }
    }

    const serviceSecret = getAmmServiceSecret()
    if (!serviceSecret) {
      return NextResponse.json({ error: 'AMM service authentication is not configured.' }, { status: 503 })
    }

    const serviceHeaders = {
      'content-type': 'application/json',
      'x-tellwise-secret': serviceSecret,
      'x-tellwise-user-id': currentUser.id,
      'x-tellwise-role': role,
      'x-tellwise-is-admin': role === 'ADMIN' ? 'true' : 'false',
    }

    const syncUrl = `${AMM_BASE_URL}/users/sync`
    const syncBody = JSON.stringify({
      id: currentUser.id,
      email: currentUser.email,
      username: currentUser.username || currentUser.name || `slimefish_${currentUser.id.slice(0, 8)}`,
      isAdmin: role === 'ADMIN',
      role,
    })
    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: serviceHeaders }),
      body: syncBody,
      cache: 'no-store',
    })
    if (!syncResponse.ok) {
      const syncPayload = await syncResponse.json().catch(() => null)
      return NextResponse.json(
        { error: syncPayload?.error || 'The AMM service could not verify the resolver.' },
        { status: syncResponse.status },
      )
    }

    const selectedTokenIdSet = new Set(canonicalWinningTokenIds)
    const resolutionTargets = resolutionType === 'binary'
      ? canonicalWinningTokenIds.map((tokenId) => {
          const winningOutcome = allEventOutcomes.find(outcome => outcome.token_id.trim() === tokenId)
          const market = marketRows.find(
            row => normalizeStoredId(row.condition_id) === normalizeStoredId(winningOutcome?.condition_id),
          )
          return market && winningOutcome ? { market, winningOutcome } : null
        }).filter((target): target is { market: typeof markets.$inferSelect, winningOutcome: typeof outcomes.$inferSelect } => Boolean(target))
      : marketRows.map((market) => {
          const yesOutcome = allEventOutcomes.find(outcome => (
            normalizeStoredId(outcome.condition_id) === normalizeStoredId(market.condition_id)
            && outcome.outcome_index === 0
          ))
          const winningIndex = yesOutcome && selectedTokenIdSet.has(yesOutcome.token_id.trim()) ? 0 : 1
          const winningOutcome = allEventOutcomes.find(outcome => (
            normalizeStoredId(outcome.condition_id) === normalizeStoredId(market.condition_id)
            && outcome.outcome_index === winningIndex
          ))
          return winningOutcome ? { market, winningOutcome } : null
        }).filter((target): target is { market: typeof markets.$inferSelect, winningOutcome: typeof outcomes.$inferSelect } => Boolean(target))

    if (resolutionTargets.length !== (resolutionType === 'binary' ? 1 : marketRows.length)) {
      return NextResponse.json({ error: 'One or more market outcomes are incomplete.' }, { status: 409 })
    }

    const resolutionPayloads = await Promise.all(resolutionTargets.map(target => (
      resolveInternalAmmMarket({
        event,
        market: target.market,
        winningOutcome: target.winningOutcome,
        serviceHeaders,
      })
    )))

    const result = await db.transaction(async (tx) => {
      const resolvedAt = new Date()
      for (const target of resolutionTargets) {
        await tx.update(outcomes)
          .set({ is_winning_outcome: false, payout_value: '0' })
          .where(eq(outcomes.condition_id, target.market.condition_id))
        await tx.update(outcomes)
          .set({ is_winning_outcome: true, payout_value: '1' })
          .where(eq(outcomes.token_id, target.winningOutcome.token_id))
        await tx.update(markets)
          .set({ is_active: false, is_resolved: true, updated_at: resolvedAt })
          .where(eq(markets.condition_id, target.market.condition_id))
        await tx.update(conditions)
          .set({
            resolved: true,
            resolution_status: 'resolved',
            resolution_price: target.winningOutcome.outcome_index === 0 ? '1' : '0',
            resolution_last_update: resolvedAt,
            updated_at: resolvedAt,
          })
          .where(eq(conditions.id, target.market.condition_id))
      }
      await tx.update(events)
        .set({ status: 'resolved', resolved_at: resolvedAt, active_markets_count: 0 })
        .where(eq(events.id, eventId))

      return { success: true }
    })

    const recipients = resolutionPayloads.flatMap(payload => (
      Array.isArray(payload?.data?.recipients)
        ? payload.data.recipients as Array<{ userId?: string, payout?: number, won?: boolean }>
        : []
    ))
    const resolvedOutcomeNames = canonicalWinningTokenIds.map((tokenId) => {
      const selectedOutcome = allEventOutcomes.find(outcome => outcome.token_id.trim() === tokenId)
      const selectedMarket = marketRows.find(
        market => normalizeStoredId(market.condition_id) === normalizeStoredId(selectedOutcome?.condition_id),
      )
      return resolutionType === 'binary'
        ? selectedOutcome?.outcome_text || tokenId
        : selectedMarket?.short_title?.trim() || selectedMarket?.title || selectedOutcome?.outcome_text || tokenId
    })
    const resolvedOutcomeName = resolvedOutcomeNames.join(', ')
    const ammConditionId = resolutionTargets[0]!.market.condition_id.trim()
    const ammWinningTokenId = canonicalWinningTokenIds[0]!
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
          extra_info: won ? `$${payoutLabel} credited to your balance` : `Outcome: ${resolvedOutcomeName}`,
          metadata: {
            source: 'amm_resolution',
            eventId,
            conditionId: ammConditionId,
            winningTokenIds: canonicalWinningTokenIds,
            outcome: resolvedOutcomeName,
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

    await recordAuditEvent({ eventType: 'market.resolved', category: 'market', action: `Resolved market as ${resolvedOutcomeName}`, actorUserId: currentUser.id, actorRole: role, entityType: 'event', entityId: eventId, metadata: { conditionId: ammConditionId, winningTokenIds: canonicalWinningTokenIds, outcome: resolvedOutcomeName, recipients: recipients.length, marketsResolved: resolutionTargets.length }, ...requestAuditContext(req.headers) })
    await db.update(resolution_proposals).set({ status: 'executed', finalized_at: new Date() }).where(and(eq(resolution_proposals.event_id, eventId), eq(resolution_proposals.status, 'pending')))

    return NextResponse.json(result)
  }
  catch (error: any) {
    console.error('Resolution API Error:', error)
    await recordAuditEvent({ eventType: 'market.payout.failed', category: 'market', action: 'Market resolution failed', outcome: 'failure', severity: 'high', metadata: { reason: getPublicResolutionError(error) }, ...requestAuditContext(req.headers) })
    return NextResponse.json(
      { error: getPublicResolutionError(error) },
      { status: error instanceof AmmResolutionError ? error.status : 500 },
    )
  }
}
