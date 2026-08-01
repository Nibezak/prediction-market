import type { NextRequest } from 'next/server'
import type Redis from 'ioredis'
import { AMM_LIVE_CHANNEL, publishLiveSnapshots, readCachedLiveSnapshots } from '@/lib/amm-live'
import type { AmmLiveSnapshot } from '@/lib/amm-live'
import { getRedis } from '@/lib/redis'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

const AMM_BASE_URL = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
const RECOVERY_INTERVAL_MS = 30_000
const MAX_MARKETS = 50

async function readCanonicalSnapshots(ids: string[]): Promise<AmmLiveSnapshot[]> {
  const secret = process.env.TELLWISE_SECRET?.trim() || ''
  const target = new URL(`${AMM_BASE_URL}/live/markets`)
  target.searchParams.set('ids', ids.join(','))
  const response = await fetch(target, {
    headers: signSlimefishBackendRequest({ url: target, headers: {
      'x-tellwise-secret': secret,
    } }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Live market service returned ${response.status}`)
  const payload = await response.json() as { data?: AmmLiveSnapshot[] }
  return payload.data ?? []
}

export async function GET(request: NextRequest) {
  const ids = Array.from(new Set(
    request.nextUrl.searchParams.get('ids')?.split(',').map(id => id.trim()).filter(Boolean) ?? [],
  )).sort()
  if (ids.length === 0 || ids.length > MAX_MARKETS) {
    return new Response('Provide between 1 and 50 market ids.', { status: 400 })
  }

  const requestedIds = new Set(ids)
  const encoder = new TextEncoder()
  let stopped = false
  let previousSignature = ''
  let recoveryTimer: ReturnType<typeof setInterval> | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let subscriber: Redis | null = null

  const stream = new ReadableStream({
    start(controller) {
      const send = (snapshots: AmmLiveSnapshot[]) => {
        if (stopped) return
        const filtered = snapshots.filter(snapshot => requestedIds.has(snapshot.marketId))
        if (filtered.length === 0) return
        const signature = filtered.map(snapshot => `${snapshot.marketId}:${snapshot.version}:${snapshot.volume}`).join('|')
        if (signature === previousSignature) return
        previousSignature = signature
        controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify({ snapshots: filtered })}\n\n`))
      }
      const recover = async () => {
        try {
          const redis = getRedis()
          const recoveryKey = `slimefish:live:recovery:${ids.join(':')}`
          if (redis) {
            if (redis.status === 'wait') await redis.connect()
            const acquired = await redis.set(recoveryKey, '1', 'PX', RECOVERY_INTERVAL_MS - 1_000, 'NX')
            if (!acquired) {
              send(await readCachedLiveSnapshots(ids))
              return
            }
          }
          const snapshots = await readCanonicalSnapshots(ids)
          await publishLiveSnapshots(snapshots)
          send(snapshots)
        }
        catch {
          // Keep the last confirmed state while the authority is temporarily unavailable.
        }
      }
      const stop = () => {
        if (stopped) return
        stopped = true
        if (recoveryTimer) clearInterval(recoveryTimer)
        if (heartbeatTimer) clearInterval(heartbeatTimer)
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
              try {
                const payload = JSON.parse(message) as { snapshots?: AmmLiveSnapshot[] }
                send(payload.snapshots ?? [])
              }
              catch {}
            })
            await subscriber.subscribe(AMM_LIVE_CHANNEL)
          }
          catch {
            subscriber?.disconnect()
            subscriber = null
          }
        }
        if (stopped) return
        const cached = await readCachedLiveSnapshots(ids)
        send(cached)
        if (cached.length < ids.length) await recover()
        if (stopped) return
        recoveryTimer = setInterval(() => void recover(), RECOVERY_INTERVAL_MS)
        heartbeatTimer = setInterval(() => {
          if (!stopped) controller.enqueue(encoder.encode(': keep-alive\n\n'))
        }, 15_000)
      })()
    },
    cancel() {
      stopped = true
      if (recoveryTimer) clearInterval(recoveryTimer)
      if (heartbeatTimer) clearInterval(heartbeatTimer)
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
