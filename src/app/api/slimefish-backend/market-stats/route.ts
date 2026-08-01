import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getRedis } from '@/lib/redis'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

/* eslint-disable style/max-statements-per-line */

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const SERVICE_KEY = process.env.SLIMEFISH_BACKEND_SERVICE_API_KEY?.trim()
  || process.env.TELLWISE_SECRET?.trim()
  || ''

const inFlightHistory = new Map<string, Promise<{ body: string, status: number }>>()
const memoryHistory = new Map<string, { body: string, expiresAt: number }>()
const HISTORY_TTL_SECONDS = 5 * 60
const HISTORY_TIME_BUCKET_SECONDS = 60

async function fetchHistory(body: Record<string, unknown>) {
  const url = `${AMM_BASE_URL}/prices`
  const requestBody = JSON.stringify(body)
  const response = await fetch(url, {
    method: 'POST',
    headers: signSlimefishBackendRequest({ url, method: 'POST', body: requestBody, headers: {
      'content-type': 'application/json',
      'x-tellwise-secret': SERVICE_KEY,
    } }),
    body: requestBody,
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  return { body: await response.text(), status: response.status }
}

export async function POST(req: Request) {
  let body: { markets?: unknown, startTs?: unknown, endTs?: unknown, fidelity?: unknown, interval?: unknown }
  try {
    body = await req.json() as { markets?: unknown }
  }
  catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const requestedIds = Array.isArray(body.markets)
    ? Array.from(new Set(body.markets.filter((id): id is string => typeof id === 'string' && id.length > 0))).slice(0, 20)
    : []
  if (requestedIds.length === 0) {
    return NextResponse.json({ history: {} })
  }

  if (!SERVICE_KEY) {
    return NextResponse.json({ error: 'Slimefish ledger service authentication is not configured.' }, { status: 503 })
  }

  try {
    function bucketTimestamp(value: unknown) {
      return typeof value === 'number'
        ? Math.floor(value / HISTORY_TIME_BUCKET_SECONDS) * HISTORY_TIME_BUCKET_SECONDS
        : undefined
    }
    const startTs = bucketTimestamp(body.startTs)
    const endTs = bucketTimestamp(body.endTs)
    const forwardedBody = {
      markets: requestedIds,
      ...(startTs !== undefined ? { startTs } : {}),
      ...(endTs !== undefined ? { endTs } : {}),
      ...(typeof body.fidelity === 'number' ? { fidelity: body.fidelity } : {}),
      ...(typeof body.interval === 'string' ? { interval: body.interval } : {}),
    }
    const cacheKey = `slimefish:history:${createHash('sha256')
      .update(JSON.stringify(forwardedBody))
      .digest('hex')}`
    const memoryCached = memoryHistory.get(cacheKey)
    if (memoryCached && memoryCached.expiresAt > Date.now()) {
      return new NextResponse(memoryCached.body, {
        headers: { 'content-type': 'application/json', 'x-slimefish-cache': 'memory' },
      })
    }
    const redis = getRedis()
    if (redis) {
      try {
        if (redis.status === 'wait') { await redis.connect() }
        const cached = await redis.get(cacheKey)
        if (cached) {
          memoryHistory.set(cacheKey, { body: cached, expiresAt: Date.now() + HISTORY_TTL_SECONDS * 1000 })
          return new NextResponse(cached, {
            headers: { 'content-type': 'application/json', 'x-slimefish-cache': 'hit' },
          })
        }
      }
      catch {
        // History remains available through Slimefish ledger if Redis is unavailable.
      }
    }

    let request = inFlightHistory.get(cacheKey)
    if (!request) {
      request = fetchHistory(forwardedBody).finally(() => inFlightHistory.delete(cacheKey))
      inFlightHistory.set(cacheKey, request)
    }
    const result = await request
    if (result.status >= 200 && result.status < 300) {
      memoryHistory.set(cacheKey, { body: result.body, expiresAt: Date.now() + HISTORY_TTL_SECONDS * 1000 })
    }
    if (result.status >= 200 && result.status < 300 && redis) {
      try { await redis.set(cacheKey, result.body, 'EX', HISTORY_TTL_SECONDS) }
      catch { /* Redis is an optimization, not a dependency. */ }
    }
    return new NextResponse(result.body, {
      status: result.status,
      headers: { 'content-type': 'application/json', 'x-slimefish-cache': 'miss' },
    })
  }
  catch (error) {
    console.error('Failed to fetch Slimefish ledger market history', error)
    return NextResponse.json({ error: 'Failed to fetch market history.' }, { status: 502 })
  }
}
