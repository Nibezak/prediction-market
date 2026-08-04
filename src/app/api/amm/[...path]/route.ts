/* eslint-disable style/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { after, NextResponse } from 'next/server'
import {
  publishAccountSnapshot,
  publishLiveSnapshots,
  readCachedAccountSnapshot,
  readCachedLiveSnapshots,
} from '@/lib/amm-live'
import { synchronizeAmmMarketVolumes } from '@/lib/amm-volume'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { UserRepository } from '@/lib/db/queries/user'
import { eq } from 'drizzle-orm'
import { conditions, event_sports, event_tags, events, markets, outcomes, tags } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { loadEventActivities } from '@/lib/event-activity'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { getAccountRestriction } from '@/lib/risk/account-restrictions'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { getClientNetworkIdentity } from '@/lib/security/client-identity'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'
import { getUserPlatformRole, canViewUserAccounts } from '@/lib/staff-role'
import { getStaffPermissions } from '@/lib/staff-permissions'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const TELLWISE_SECRET = process.env.TELLWISE_SECRET?.trim()
  || ''
const USER_SYNC_CACHE_TTL_MS = 5 * 60 * 1000
const globalForAmmProxy = globalThis as unknown as {
  ammUserSyncCache?: Map<string, { userId: string, expiresAt: number }>
  ammAccountSnapshotLoads?: Map<string, Promise<Awaited<ReturnType<typeof readCachedAccountSnapshot>>>>
}
const userSyncCache = globalForAmmProxy.ammUserSyncCache ?? new Map<string, { userId: string, expiresAt: number }>()
globalForAmmProxy.ammUserSyncCache = userSyncCache
const accountSnapshotLoads = globalForAmmProxy.ammAccountSnapshotLoads ?? new Map<string, Promise<Awaited<ReturnType<typeof readCachedAccountSnapshot>>>>()
globalForAmmProxy.ammAccountSnapshotLoads = accountSnapshotLoads

async function loadLegacyAccountSnapshot(sessionUser: { id: string, name?: string | null, email?: string | null }) {
  const cached = await readCachedAccountSnapshot(sessionUser.id)
  if (cached) return cached
  const running = accountSnapshotLoads.get(sessionUser.id)
  if (running) return running

  const load = (async () => {
    const baseServiceHeaders = {
      'content-type': 'application/json',
      'x-tellwise-secret': TELLWISE_SECRET,
    }
    const syncBody = JSON.stringify({
      id: sessionUser.id,
      username: sessionUser.name || `slimefish_${sessionUser.id.slice(0, 8)}`,
      email: sessionUser.email || `${sessionUser.id}@slimefish.local`,
    })
    const syncUrl = `${AMM_BASE_URL}/users/sync`
    const syncResponse = await fetch(`${AMM_BASE_URL}/users/sync`, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: { ...baseServiceHeaders, 'idempotency-key': `legacy-account-sync:${sessionUser.id}` } }),
      body: syncBody,
      signal: AbortSignal.timeout(3_000),
    })
    if (!syncResponse.ok) return null
    const synced = await syncResponse.json() as { userId?: string, user?: { id?: string } }
    const slimefishBackendUserId = synced.userId || synced.user?.id || sessionUser.id
    userSyncCache.set(sessionUser.id, { userId: slimefishBackendUserId, expiresAt: Date.now() + USER_SYNC_CACHE_TTL_MS })
    const liveUrl = `${AMM_BASE_URL}/users/${encodeURIComponent(slimefishBackendUserId)}/live`
    const liveResponse = await fetch(liveUrl, {
      headers: signSlimefishBackendRequest({ url: liveUrl, headers: baseServiceHeaders }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    })
    if (!liveResponse.ok) return null
    const body = await liveResponse.json() as { data?: Awaited<ReturnType<typeof readCachedAccountSnapshot>> }
    if (!body.data) return null
    await publishAccountSnapshot(sessionUser.id, body.data)
    return body.data
  })().catch(() => null).finally(() => accountSnapshotLoads.delete(sessionUser.id))
  accountSnapshotLoads.set(sessionUser.id, load)
  return load
}

async function proxyRequest(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!TELLWISE_SECRET) {
    return NextResponse.json({ error: 'AMM service authentication is not configured.' }, { status: 503 })
  }
  const resolvedParams = await params
  const path = resolvedParams.path
  const isLegacyMarketRead = req.method === 'GET'
    && path.length === 2
    && path[0] === 'markets'

  // Older browser bundles still poll this route. Serve the canonical public
  // snapshot before touching auth or the database so stale tabs stay cheap.
  if (isLegacyMarketRead) {
    const [snapshot] = await readCachedLiveSnapshots([path[1]])
    if (snapshot) {
      return NextResponse.json(
        { data: snapshot },
        { headers: { 'cache-control': 'private, no-store', 'x-slimefish-cache': 'redis' } },
      )
    }
  }
  // Quotes are read-only calculations even though the engine exposes them as POST.
  const isPublicQuote = req.method === 'POST'
    && path.length === 3
    && path[0] === 'markets'
    && path[2] === 'quote'

  // Parse session using next/headers for better-auth
  let session = null
  if (!isPublicQuote) {
    try {
      session = await auth.api.getSession({
        headers: await headers(),
      })
    }
    catch (e) {
      console.error('Session parse error:', e)
    }
  }

  // Stale tabs may still call the pre-SSE account endpoints. Keep those calls
  // authenticated, but answer from the live read model before database-backed
  // role, restriction, and user-sync work. The stream uses the same snapshot.
  const isLegacyAccountRead = req.method === 'GET'
    && path.length === 3
    && path[0] === 'users'
    && path[1] === 'me'
    && (path[2] === 'balance' || path[2] === 'stats')
  if (isLegacyAccountRead && session?.user?.id) {
    const accountSnapshot = await loadLegacyAccountSnapshot(session.user)
    if (accountSnapshot) {
      if (path[2] === 'balance') {
        return NextResponse.json({
          data: { balance: { total: accountSnapshot.balance, subtotals: {} } },
        }, { headers: { 'cache-control': 'private, no-store', 'x-slimefish-cache': 'redis-fast' } })
      }
      const positionsValue = accountSnapshot.positions.reduce((total, position) => total + position.value, 0)
      return NextResponse.json({
        data: {
          netWorth: accountSnapshot.balance + positionsValue,
          tradingVolume: accountSnapshot.positions.reduce((total, position) => total + position.cost, 0),
          totalMarkets: new Set(accountSnapshot.positions.map(position => position.marketId)).size,
          lastTradeAt: null,
          activeDayCount: 0,
          otherIncome: 0,
          quests: [],
        },
      }, { headers: { 'cache-control': 'private, no-store', 'x-slimefish-cache': 'redis-fast' } })
    }
  }

  // Every ledger-mutating request and session-scoped user request remains protected.
  const isProtectedPath = path.includes('me')
    || (!isPublicQuote && req.method !== 'GET' && req.method !== 'OPTIONS')
  if (isProtectedPath && !session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const effectiveUser = session?.user
    ? await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
    : null
  if (isProtectedPath && !effectiveUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (isProtectedPath && effectiveUser?.id) {
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      try { await assertOperationEnabled('trading') }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Trading is unavailable' }, { status: 503 }) }
    }
    try {
      const isWrite = req.method !== 'GET' && req.method !== 'OPTIONS'
      const client = getClientNetworkIdentity(req.headers)
      await enforceRateLimit({ scope: isWrite ? 'amm-user-write' : 'amm-user-read', identifier: effectiveUser.id, limit: isWrite ? 30 : 180, windowSeconds: 60 })
      if (isWrite) {
        await Promise.all([
          enforceRateLimit({ scope: 'amm-user-burst', identifier: effectiveUser.id, limit: 8, windowSeconds: 10 }),
          enforceRateLimit({ scope: 'amm-ip-write', identifier: client.ip, limit: 60, windowSeconds: 60 }),
          enforceRateLimit({ scope: 'amm-client-write', identifier: client.fingerprint, limit: 24, windowSeconds: 60 }),
        ])
      }
    }
    catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Too many requests' }, { status: 429, headers: { 'retry-after': String((error as any)?.retryAfter || 60) } })
    }
    const restriction = await getAccountRestriction(effectiveUser.id)
    if (restriction.restricted) {
      return NextResponse.json({ error: restriction.reason }, { status: 423 })
    }
  }

  let userId = effectiveUser?.id || 'public-user'

  // Handle admin viewing another user's profile
  const isUserSpecificPath = path.length >= 3
    && path[0] === 'users'
    && path[1] !== 'me'
    && (path[2] === 'positions' || path[2] === 'transactions')
  
  if (isUserSpecificPath && canViewUserAccounts(effectiveUser as any)) {
    const targetUserAddress = path[1]
    userId = targetUserAddress
  }
  // Construct the target URL
  else if (effectiveUser?.id) {
    const cachedSync = userSyncCache.get(effectiveUser.id)
    if (cachedSync && cachedSync.expiresAt > Date.now()) {
      userId = cachedSync.userId
    }
    else {
      try {
        const syncUrl = `${AMM_BASE_URL}/users/sync`
        const syncBody = JSON.stringify({
          id: effectiveUser.id,
          username: effectiveUser.name || `slimefish_${effectiveUser.id.slice(0, 8)}`,
          email: effectiveUser.email || `${effectiveUser.id}@slimefish.local`,
          isAdmin: (effectiveUser as any).is_admin === true,
          role: getUserPlatformRole(effectiveUser as any),
        })
        const syncResponse = await fetch(syncUrl, {
          method: 'POST',
          headers: signSlimefishBackendRequest({
            url: syncUrl,
            method: 'POST',
            body: syncBody,
            headers: {
              'Content-Type': 'application/json',
            'x-tellwise-secret': TELLWISE_SECRET,
              'idempotency-key': `user-sync:${effectiveUser.id}`,
            },
          }),
          body: syncBody,
        })
        if (syncResponse.ok) {
          const synced = await syncResponse.json() as { userId?: string, user?: { id?: string } }
          userId = synced.userId || synced.user?.id || userId
          userSyncCache.set(effectiveUser.id, {
            userId,
            expiresAt: Date.now() + USER_SYNC_CACHE_TTL_MS,
          })
        }
      }
      catch (e) {
        console.error('Failed to sync user to AMM:', e)
      }
    }
  }

  // Resolve the session-scoped alias after syncing so every downstream endpoint
  // uses Slimefish ledger's canonical ledger user id.
  const newPath = path.map((segment: string) => segment === 'me' ? userId : segment)
  const pathStr = newPath.join('/')

  if (req.method === 'GET' && effectiveUser?.id) {
    const accountSnapshot = await readCachedAccountSnapshot(effectiveUser.id)
    if (accountSnapshot && pathStr === `users/${userId}/balance`) {
      return NextResponse.json({
        data: {
          balance: {
            total: accountSnapshot.balance,
            subtotals: {},
          },
        },
      }, { headers: { 'cache-control': 'private, no-store', 'x-slimefish-cache': 'redis' } })
    }
    if (accountSnapshot && pathStr === `users/${userId}/stats`) {
      const positionsValue = accountSnapshot.positions.reduce((total, position) => total + position.value, 0)
      return NextResponse.json({
        data: {
          netWorth: accountSnapshot.balance + positionsValue,
          tradingVolume: accountSnapshot.positions.reduce((total, position) => total + position.cost, 0),
          totalMarkets: new Set(accountSnapshot.positions.map(position => position.marketId)).size,
          lastTradeAt: null,
          activeDayCount: 0,
          otherIncome: 0,
          quests: [],
        },
      }, { headers: { 'cache-control': 'private, no-store', 'x-slimefish-cache': 'redis' } })
    }
  }

  const targetUrl = new URL(`${AMM_BASE_URL}/${pathStr}`)

  // Forward search params
  const searchParams = new URL(req.url).searchParams
  searchParams.forEach((value, key) => {
    targetUrl.searchParams.append(key, value)
  })

  // Prepare headers
  const proxyHeaders = new Headers()
  proxyHeaders.set('Content-Type', 'application/json')
  proxyHeaders.set('x-tellwise-secret', TELLWISE_SECRET)
  proxyHeaders.set('x-tellwise-user-id', userId)
  proxyHeaders.set('x-tellwise-role', getUserPlatformRole(effectiveUser as any))
  proxyHeaders.set('x-tellwise-permissions', getStaffPermissions(effectiveUser as any).join(','))
  proxyHeaders.set('x-request-id', req.headers.get('x-request-id') || randomUUID())
  if (req.method !== 'GET' && req.method !== 'HEAD' && !isPublicQuote) {
    proxyHeaders.set('idempotency-key', req.headers.get('idempotency-key') || randomUUID())
  }

  const requestInit: RequestInit = {
    method: req.method,
    headers: proxyHeaders,
  }
  let requestBody: Record<string, unknown> = {}

  // Forward body if present
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const text = await req.text()
    if (text) {
      try {
        requestBody = JSON.parse(text)
        if (pathStr === 'sync/event-creations' && effectiveUser) {
          requestBody = {
            ...requestBody,
            createdBy: userId,
            creatorId: userId,
            creatorEmail: effectiveUser.email || null,
          }
        }
        requestInit.body = JSON.stringify(requestBody)
      }
      catch {
        requestBody = { bodyType: 'non-json' }
        requestInit.body = text
      }
    }
  }

  try {
    requestInit.headers = signSlimefishBackendRequest({
      url: targetUrl,
      method: req.method,
      body: typeof requestInit.body === 'string' ? requestInit.body : null,
      headers: proxyHeaders,
    })
    const response = await fetch(targetUrl.toString(), requestInit)
    const data = await response.text()

    // Parse json if possible
    let jsonData
    try {
      jsonData = JSON.parse(data)
    }
    catch {
      jsonData = data
    }

    if (
      response.ok
      && req.method === 'POST'
      && pathStr === 'sync/event-creations'
      && jsonData?.event?.id
      && (jsonData?.market?.id || Array.isArray(jsonData?.markets))
    ) {
      const createdEvent = jsonData.event
      const createdMarkets = Array.isArray(jsonData.markets) && jsonData.markets.length > 0
        ? jsonData.markets
        : [jsonData.market]
      const firstMarket = createdMarkets[0]
      const closeDate = firstMarket?.closeDate ? new Date(firstMarket.closeDate) : null
      const requestedOptions = Array.isArray(requestBody.options) ? requestBody.options as Array<Record<string, unknown>> : []

      await db.transaction(async (tx) => {
        await tx.insert(conditions).values(createdMarkets.map((createdMarket: any) => ({
          id: createdMarket.id,
          oracle: '0x0000000000000000000000000000000000000000',
          question_id: `slimefish-backend:${createdMarket.id}`,
          resolved: false,
        }))).onConflictDoNothing()

        await tx.insert(events).values({
          id: createdEvent.id,
          slug: createdEvent.slug,
          title: createdEvent.title,
          // In the internal-ledger model this field records the authenticated
          // staff user who created the market, not a retired EOA address.
          creator: userId,
          icon_url: (typeof requestBody.eventImageUrl === 'string' && requestBody.eventImageUrl) ? requestBody.eventImageUrl : (createdEvent.iconUrl || '/images/branding/slimefish.png'),
          is_hidden: false,
          rules: firstMarket?.description || '',
          status: 'active',
          active_markets_count: createdMarkets.length,
          total_markets_count: createdMarkets.length,
          start_date: createdEvent.startDate ? new Date(createdEvent.startDate) : new Date(),
          end_date: closeDate,
        }).onConflictDoNothing()

        await tx.insert(markets).values(createdMarkets.map((createdMarket: any, index: number) => ({
          condition_id: createdMarket.id,
          event_id: createdEvent.id,
          title: createdMarket.candidate || createdMarket.question,
          slug: createdMarket.slug,
          question: createdMarket.question,
          market_rules: createdMarket.description || '',
          icon_url: typeof requestedOptions[index]?.imageUrl === 'string' ? requestedOptions[index].imageUrl as string : (typeof requestBody.eventImageUrl === 'string' && requestBody.eventImageUrl ? requestBody.eventImageUrl : null),
          is_active: true,
          is_resolved: false,
          volume: '0',
          end_time: createdMarket.closeDate ? new Date(createdMarket.closeDate) : closeDate,
        }))).onConflictDoNothing()

        const createdOutcomes = createdMarkets.flatMap((createdMarket: any) => (
          Array.isArray(createdMarket.options)
            ? createdMarket.options.map((option: any, index: number) => ({
                condition_id: createdMarket.id,
                outcome_text: option.name,
                outcome_index: index,
                token_id: option.id,
                is_winning_outcome: false,
                payout_value: '0',
              }))
            : []
        ))
        if (createdOutcomes.length > 0) {
          await tx.insert(outcomes).values(createdOutcomes).onConflictDoNothing()
        }

        // Insert and link category tags so the event shows in its category (Culture, etc.) instead of defaulting to World
        const categoryList: string[] = []
        if (typeof requestBody.mainCategorySlug === 'string' && requestBody.mainCategorySlug.trim()) {
          categoryList.push(requestBody.mainCategorySlug.trim().toLowerCase())
        }
        if (Array.isArray(requestBody.categories)) {
          for (const item of requestBody.categories) {
            const slug = typeof item === 'string' ? item : item?.slug
            if (typeof slug === 'string' && slug.trim() && !categoryList.includes(slug.trim().toLowerCase())) {
              categoryList.push(slug.trim().toLowerCase())
            }
          }
        }
        if (categoryList.length === 0) {
          const fallbackTag = String(requestBody.mainTag || requestBody.category || '').trim().toLowerCase()
          if (fallbackTag) categoryList.push(fallbackTag)
        }

        const MAIN_CATEGORIES = ['politics', 'sports', 'crypto', 'esports', 'finance', 'geopolitics', 'tech', 'culture', 'world', 'economy', 'weather', 'elections', 'mentions']
        for (const catSlug of categoryList) {
          const isMain = MAIN_CATEGORIES.includes(catSlug)
          const name = catSlug.charAt(0).toUpperCase() + catSlug.slice(1)
          const existing = await tx.select({ id: tags.id }).from(tags).where(eq(tags.slug, catSlug)).limit(1)
          let tagId: number | undefined = existing[0]?.id
          if (!tagId) {
            const inserted = await tx.insert(tags).values({ name, slug: catSlug, is_main_category: isMain }).returning({ id: tags.id })
            tagId = inserted[0]?.id
          }
          if (tagId) {
            await tx.insert(event_tags).values({ event_id: createdEvent.id, tag_id: tagId }).onConflictDoNothing()
          }
        }

        const mainTag = String(requestBody.mainTag || requestBody.category || requestBody.mainCategorySlug || '').toLowerCase()
        const tagsArray = categoryList
        const isSports = mainTag === 'sports' || mainTag === 'esports' || tagsArray.includes('sports') || tagsArray.includes('esports')
        if (isSports || requestBody.sportsSportSlug || requestBody.sportSlug) {
          const sportSlug = String(requestBody.sportsSportSlug || requestBody.sportSlug || (mainTag === 'esports' ? 'esports' : 'sports')).toLowerCase()
          await tx.insert(event_sports).values({
            event_id: createdEvent.id,
            sports_sport_slug: sportSlug,
            sports_league_slug: typeof requestBody.sportsLeagueSlug === 'string' ? requestBody.sportsLeagueSlug.toLowerCase() : null,
            sports_series_slug: typeof requestBody.sportsSeriesSlug === 'string' ? requestBody.sportsSeriesSlug.toLowerCase() : null,
            sports_event_slug: createdEvent.slug,
            sports_live: false,
            sports_ended: false,
          }).onConflictDoNothing()
        }
      })
    }

    const mutation = req.method !== 'GET' && !isPublicQuote
    const isBuy = pathStr.endsWith('/buy')
    const isSell = pathStr.endsWith('/sell')
    const isLiquidity = pathStr.includes('liquidity')
    const liveSnapshot = jsonData?.data?.snapshot
    const publicLiveSnapshots = Array.isArray(jsonData?.data?.markets)
      ? jsonData.data.markets
      : []
    after(async () => {
      if (response.ok && publicLiveSnapshots.length > 0) {
        await publishLiveSnapshots(publicLiveSnapshots).catch(() => null)
      }
      if (response.ok && liveSnapshot?.marketId && effectiveUser?.id && liveSnapshot.user) {
        await publishAccountSnapshot(effectiveUser.id, {
          userId: effectiveUser.id,
          version: Number(liveSnapshot.version || Date.now()),
          balance: Number(liveSnapshot.user.balance || 0),
          positions: (liveSnapshot.user.positions || []).map((position: any) => ({
            marketId: liveSnapshot.marketId,
            optionId: position.optionId,
            optionName: position.optionName,
            outcomeIndex: Number.isFinite(position.outcomeIndex) ? Number(position.outcomeIndex) : undefined,
            cost: Number(position.cost || 0),
            quantity: Number(position.quantity || 0),
            value: Number(position.value || 0),
          })),
        }).catch(() => null)
      }
    })
    if (mutation && session?.user) {
      const eventType = isBuy
        ? (response.ok ? 'trade.buy.completed' : 'trade.buy.failed')
        : isSell
          ? (response.ok ? 'trade.sell.completed' : 'trade.sell.failed')
          : isLiquidity
            ? (response.ok ? 'trade.liquidity.added' : 'trade.liquidity.failed')
            : null
      const marketId = newPath[1]
      after(async () => {
        if (eventType) {
          await recordAuditEvent({
            eventType,
            category: 'trading',
            action: `${req.method} ${pathStr}`,
            outcome: response.ok ? 'success' : 'failure',
            severity: response.ok ? 'info' : 'warning',
            actorUserId: session.user.id,
            actorRole: getUserPlatformRole(session.user as any),
            subjectUserId: effectiveUser?.id || session.user.id,
            entityType: 'amm_market',
            entityId: marketId || null,
            metadata: { request: requestBody, status: response.status, response: response.ok ? { id: jsonData?.id || jsonData?.transaction?.id } : jsonData },
            ...requestAuditContext(req.headers),
          })
        }
        if (response.ok && marketId && (isBuy || isSell)) {
          await synchronizeAmmMarketVolumes([marketId])
          await loadEventActivities([marketId])
        }
      })
    }
    return NextResponse.json(jsonData, { status: response.status })
  }
  catch (error: any) {
    console.error('AMM Proxy Error:', error)
    return NextResponse.json({ error: 'Failed to connect to AMM engine' }, { status: 502 })
  }
}

export const GET = proxyRequest
export const POST = proxyRequest
export const PUT = proxyRequest
export const DELETE = proxyRequest
