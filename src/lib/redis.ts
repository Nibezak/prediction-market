import 'server-only'

import Redis from 'ioredis'

type RedisGlobal = typeof globalThis & {
  slimefishRedis?: Redis
}

export function getRedis() {
  const url = process.env.REDIS_URL?.trim()
  if (!url) return null

  const redisGlobal = globalThis as RedisGlobal
  if (!redisGlobal.slimefishRedis) {
    redisGlobal.slimefishRedis = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: 1_500,
      commandTimeout: 1_000,
      retryStrategy: times => times <= 1 ? 100 : null,
    })
    redisGlobal.slimefishRedis.on('error', (error) => {
      console.error('Redis transport error:', error.message)
    })
  }

  return redisGlobal.slimefishRedis
}
