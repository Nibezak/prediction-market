/* eslint-disable style/max-statements-per-line */
import { randomUUID } from 'node:crypto'
import { headers } from 'next/headers'
import { after, NextResponse } from 'next/server'
import { synchronizeAmmMarketVolumes } from '@/lib/amm-volume'
import { recordAuditEvent, requestAuditContext } from '@/lib/audit'
import { auth } from '@/lib/auth'
import { conditions, events, markets, outcomes } from '@/lib/db/schema'
import { db } from '@/lib/drizzle'
import { assertOperationEnabled } from '@/lib/operations/controls'
import { getAccountRestriction } from '@/lib/risk/account-restrictions'
import { enforceRateLimit } from '@/lib/security/rate-limit'
import { getUserPlatformRole } from '@/lib/staff-role'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const DEVELOPMENT_SERVICE_SECRET = 'tellwise_super_secret_bypass_key_123'
const TELLWISE_SECRET = process.env.TELLWISE_SECRET?.trim()
  || (process.env.NODE_ENV === 'development' ? DEVELOPMENT_SERVICE_SECRET : '')

async function proxyRequest(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  if (!TELLWISE_SECRET) {
    return NextResponse.json({ error: 'AMM service authentication is not configured.' }, { status: 503 })
  }
  const resolvedParams = await params
  const path = resolvedParams.path
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

  // Every ledger-mutating request and session-scoped user request remains protected.
  const isProtectedPath = path.includes('me')
    || (!isPublicQuote && req.method !== 'GET' && req.method !== 'OPTIONS')
  if (isProtectedPath && !session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (isProtectedPath && session?.user?.id) {
    if (req.method !== 'GET' && req.method !== 'OPTIONS') {
      try { await assertOperationEnabled('trading') }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Trading is unavailable' }, { status: 503 }) }
    }
    try {
      await enforceRateLimit({ scope: req.method === 'GET' ? 'amm-user-read' : 'amm-user-write', identifier: session.user.id, limit: req.method === 'GET' ? 180 : 30, windowSeconds: 60 })
    }
    catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Too many requests' }, { status: 429, headers: { 'retry-after': String((error as any)?.retryAfter || 60) } })
    }
    const restriction = await getAccountRestriction(session.user.id)
    if (restriction.restricted) {
      return NextResponse.json({ error: restriction.reason }, { status: 423 })
    }
  }

  let userId = session?.user?.id || 'public-user'

  // Construct the target URL
  if (session?.user?.id) {
    try {
      const syncResponse = await fetch(`${AMM_BASE_URL}/users/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tellwise-secret': TELLWISE_SECRET,
          'x-play-money-api-key': process.env.PLAY_MONEY_SERVICE_API_KEY?.trim() || TELLWISE_SECRET,
          'idempotency-key': `user-sync:${session.user.id}`,
        },
        body: JSON.stringify({
          id: session.user.id,
          username: session.user.name || `tellwise_${session.user.id.slice(0, 8)}`,
          email: session.user.email || `${session.user.id}@tellwise.local`,
          isAdmin: (session.user as any).is_admin === true,
          role: getUserPlatformRole(session.user as any),
        }),
      })
      if (syncResponse.ok) {
        const synced = await syncResponse.json() as { userId?: string, user?: { id?: string } }
        userId = synced.userId || synced.user?.id || userId
      }
    }
    catch (e) {
      console.error('Failed to sync user to AMM:', e)
    }
  }

  // Resolve the session-scoped alias after syncing so every downstream endpoint
  // uses Play Money's canonical ledger user id.
  const newPath = path.map((segment: string) => segment === 'me' ? userId : segment)
  const pathStr = newPath.join('/')

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
  proxyHeaders.set('x-play-money-api-key', process.env.PLAY_MONEY_SERVICE_API_KEY?.trim() || TELLWISE_SECRET)
  proxyHeaders.set('x-tellwise-user-id', userId)
  proxyHeaders.set('x-tellwise-role', getUserPlatformRole(session?.user as any))
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
      requestInit.body = text
      try {
        requestBody = JSON.parse(text)
      }
      catch {
        requestBody = { bodyType: 'non-json' }
      }
    }
  }

  try {
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
      && jsonData?.market?.id
    ) {
      const createdEvent = jsonData.event
      const createdMarket = jsonData.market
      const closeDate = createdMarket.closeDate ? new Date(createdMarket.closeDate) : null

      await db.transaction(async (tx) => {
        await tx.insert(conditions).values({
          id: createdMarket.id,
          oracle: '0x0000000000000000000000000000000000000000',
          question_id: `play-money:${createdMarket.id}`,
          resolved: false,
        }).onConflictDoNothing()

        await tx.insert(events).values({
          id: createdEvent.id,
          slug: createdEvent.slug,
          title: createdEvent.title,
          creator: '0x0000000000000000000000000000000000000000',
          icon_url: createdEvent.iconUrl || '/images/branding/slimefish.svg',
          is_hidden: false,
          rules: createdMarket.description || '',
          status: 'active',
          active_markets_count: 1,
          total_markets_count: 1,
          start_date: createdEvent.startDate ? new Date(createdEvent.startDate) : new Date(),
          end_date: closeDate,
        }).onConflictDoNothing()

        await tx.insert(markets).values({
          condition_id: createdMarket.id,
          event_id: createdEvent.id,
          title: createdMarket.question,
          slug: createdMarket.slug,
          question: createdMarket.question,
          market_rules: createdMarket.description || '',
          is_active: true,
          is_resolved: false,
          volume: '0',
          end_time: closeDate,
        }).onConflictDoNothing()

        if (Array.isArray(createdMarket.options) && createdMarket.options.length > 0) {
          await tx.insert(outcomes).values(createdMarket.options.map((option: any, index: number) => ({
            condition_id: createdMarket.id,
            outcome_text: option.name,
            outcome_index: index,
            token_id: option.id,
            is_winning_outcome: false,
            payout_value: '0',
          }))).onConflictDoNothing()
        }
      })
    }

    const mutation = req.method !== 'GET' && !isPublicQuote
    if (mutation && session?.user) {
      const isBuy = pathStr.endsWith('/buy')
      const isSell = pathStr.endsWith('/sell')
      const isLiquidity = pathStr.includes('liquidity')
      const eventType = isBuy
        ? (response.ok ? 'trade.buy.completed' : 'trade.buy.failed')
        : isSell
          ? (response.ok ? 'trade.sell.completed' : 'trade.sell.failed')
          : isLiquidity
            ? (response.ok ? 'trade.liquidity.added' : 'trade.liquidity.failed')
            : null
      if (eventType) {
        await recordAuditEvent({
          eventType,
          category: 'trading',
          action: `${req.method} ${pathStr}`,
          outcome: response.ok ? 'success' : 'failure',
          severity: response.ok ? 'info' : 'warning',
          actorUserId: session.user.id,
          actorRole: getUserPlatformRole(session.user as any),
          subjectUserId: session.user.id,
          entityType: 'amm_market',
          entityId: pathStr.split('/')[1] || null,
          metadata: { request: requestBody, status: response.status, response: response.ok ? { id: jsonData?.id || jsonData?.transaction?.id } : jsonData },
          ...requestAuditContext(req.headers),
        })
      }
      if (response.ok && (isBuy || isSell)) {
        const marketId = newPath[1]
        if (marketId) { after(() => synchronizeAmmMarketVolumes([marketId])) }
      }
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
