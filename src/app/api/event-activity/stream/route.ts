import type Redis from 'ioredis'
import { EVENT_ACTIVITY_CHANNEL, loadEventActivities, readCachedEventActivities } from '@/lib/event-activity'
import { getRedis } from '@/lib/redis'

export async function GET(request: Request) {
  const market = new URL(request.url).searchParams.get('market')
  const marketIds = market?.split(',').map(id => id.trim()).filter(Boolean) ?? []
  if (marketIds.length === 0) return new Response('Missing market parameter.', { status: 400 })

  const encoder = new TextEncoder()
  let closed = false
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let subscriber: Redis | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let previousSignature = ''
      const close = () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        if (subscriber) void subscriber.quit().catch(() => subscriber?.disconnect())
        try { controller.close() } catch {}
      }
      request.signal.addEventListener('abort', close, { once: true })

      const send = (activities: Awaited<ReturnType<typeof loadEventActivities>>) => {
        if (closed) return
          const signature = activities.map(activity => activity.id).join(':')
          if (signature !== previousSignature) {
            previousSignature = signature
            controller.enqueue(encoder.encode(`event: activity\ndata: ${JSON.stringify(activities)}\n\n`))
          }
      }

      controller.enqueue(encoder.encode(': connected\n\n'))
      void (async () => {
        const cached = await readCachedEventActivities(marketIds)
        send(cached.length > 0 ? cached : await loadEventActivities(marketIds, request.signal))
        const redis = getRedis()
        if (redis && !closed) {
          try {
            if (redis.status === 'wait') await redis.connect()
            subscriber = redis.duplicate({ enableOfflineQueue: false, maxRetriesPerRequest: 1 })
            subscriber.on('message', (_channel, message) => {
              try {
                const payload = JSON.parse(message) as { marketIds?: string[], activities?: Awaited<ReturnType<typeof loadEventActivities>> }
                if (payload.marketIds?.some(id => marketIds.includes(id))) void readCachedEventActivities(marketIds).then(send)
              }
              catch {}
            })
            await subscriber.subscribe(EVENT_ACTIVITY_CHANNEL)
          }
          catch { subscriber?.disconnect(); subscriber = null }
        }
        heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(encoder.encode(': keep-alive\n\n'))
        }, 15_000)
      })().catch(() => close())
    },
    cancel() {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      if (subscriber) void subscriber.quit().catch(() => subscriber?.disconnect())
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    },
  })
}
