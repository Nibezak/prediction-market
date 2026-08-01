import type Redis from 'ioredis'
import { headers } from 'next/headers'
import { AMM_ACCOUNT_CHANNEL_PREFIX, publishAccountSnapshot, readCachedAccountSnapshot } from '@/lib/amm-live'
import type { AmmLiveAccountSnapshot } from '@/lib/amm-live'
import { auth } from '@/lib/auth'
import { UserRepository } from '@/lib/db/queries/user'
import { getRedis } from '@/lib/redis'
import { getSlimefishBackendServiceKey, signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'
import { getUserPlatformRole } from '@/lib/staff-role'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'

async function loadCanonicalAccountSnapshot(user: Awaited<ReturnType<typeof UserRepository.getCurrentUser>>) {
  if (!user?.id) return null
  const secret = process.env.TELLWISE_SECRET?.trim() || ''
  const apiKey = getSlimefishBackendServiceKey()
  if (!secret || !apiKey) return null
  const serviceHeaders = {
    'content-type': 'application/json',
    'x-tellwise-secret': secret,
  }
  const syncUrl = `${AMM_BASE_URL}/users/sync`
  const syncBody = JSON.stringify({
    id: user.id,
    username: user.name || `slimefish_${user.id.slice(0, 8)}`,
    email: user.email || `${user.id}@slimefish.local`,
    isAdmin: (user as { is_admin?: boolean }).is_admin === true,
    role: getUserPlatformRole(user),
  })
  try {
    const syncResponse = await fetch(syncUrl, {
      method: 'POST',
      headers: signSlimefishBackendRequest({ url: syncUrl, method: 'POST', body: syncBody, headers: { ...serviceHeaders, 'idempotency-key': `account-stream-sync:${user.id}` } }),
      body: syncBody,
      signal: AbortSignal.timeout(5_000),
    })
    if (!syncResponse.ok) return null
    const synced = await syncResponse.json() as { userId?: string, user?: { id?: string } }
    const slimefishBackendUserId = synced.userId || synced.user?.id || user.id
    const liveUrl = `${AMM_BASE_URL}/users/${encodeURIComponent(slimefishBackendUserId)}/live`
    const response = await fetch(liveUrl, {
      headers: signSlimefishBackendRequest({ url: liveUrl, headers: serviceHeaders }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) return null
    const body = await response.json() as { data?: AmmLiveAccountSnapshot }
    if (!body.data) return null
    const snapshot = { ...body.data, userId: user.id }
    await publishAccountSnapshot(user.id, snapshot)
    return snapshot
  }
  catch {
    return null
  }
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return new Response('Unauthorized', { status: 401 })
  const user = await UserRepository.getCurrentUser({ disableCookieCache: true, minimal: true })
  if (!user?.id) return new Response('Unauthorized', { status: 401 })

  const encoder = new TextEncoder()
  let stopped = false
  let subscriber: Redis | null = null
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (snapshot: AmmLiveAccountSnapshot) => {
        if (!stopped) controller.enqueue(encoder.encode(`event: account\ndata: ${JSON.stringify({ ...snapshot, userId: user.id })}\n\n`))
      }
      const stop = () => {
        if (stopped) return
        stopped = true
        if (heartbeat) clearInterval(heartbeat)
        if (subscriber) void subscriber.quit().catch(() => subscriber?.disconnect())
        try { controller.close() } catch {}
      }
      request.signal.addEventListener('abort', stop, { once: true })

      void (async () => {
        const redis = getRedis()
        if (redis) {
          try {
            if (redis.status === 'wait') await redis.connect()
            subscriber = redis.duplicate({
              enableOfflineQueue: false,
              maxRetriesPerRequest: 0,
              connectTimeout: 1_500,
              commandTimeout: 1_000,
              retryStrategy: times => times <= 1 ? 100 : null,
            })
            subscriber.on('message', (_channel, message) => {
              try { send(JSON.parse(message) as AmmLiveAccountSnapshot) } catch {}
            })
            await subscriber.subscribe(`${AMM_ACCOUNT_CHANNEL_PREFIX}${user.id}`)
          }
          catch {
            subscriber?.disconnect()
            subscriber = null
          }
        }
        if (stopped) return
        const cached = await readCachedAccountSnapshot(user.id)
        if (cached) send(cached)
        else {
          const canonical = await loadCanonicalAccountSnapshot(user)
          if (canonical) send(canonical)
        }
        heartbeat = setInterval(() => {
          if (!stopped) controller.enqueue(encoder.encode(': keep-alive\n\n'))
        }, 15_000)
      })()
    },
    cancel() {
      stopped = true
      if (heartbeat) clearInterval(heartbeat)
      if (subscriber) void subscriber.quit().catch(() => subscriber?.disconnect())
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
