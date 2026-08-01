/* eslint-disable style/max-statements-per-line */
import { getRedis } from '@/lib/redis'

import 'server-only'

export const AMM_LIVE_CHANNEL = 'slimefish:live:updates'
export const AMM_ACCOUNT_CHANNEL_PREFIX = 'slimefish:live:account:'
const SNAPSHOT_TTL_SECONDS = 60 * 60
const LOCAL_SNAPSHOT_TTL_MS = 750

const localMarketSnapshots = new Map<string, { expiresAt: number, snapshot: AmmLiveSnapshot }>()
const localAccountSnapshots = new Map<string, { expiresAt: number, snapshot: AmmLiveAccountSnapshot }>()

export interface AmmLiveSnapshot {
  marketId: string
  eventId: string
  status: 'active' | 'closed' | 'resolved' | 'canceled'
  version: number
  volume: number
  volume24h: number
  liquidity: number
  options: Array<{ id: string, name: string, color: string | null, probability: number }>
  user?: {
    balance: number
    positions: Array<{
      optionId: string
      optionName?: string
      outcomeIndex?: number
      cost: number
      quantity: number
      value: number
    }>
  } | null
}

export interface AmmLiveAccountSnapshot {
  userId?: string
  version: number
  balance: number
  positions: Array<{
    marketId: string
    optionId: string
    optionName?: string
    outcomeIndex?: number
    cost: number
    quantity: number
    value: number
  }>
}

function snapshotKey(marketId: string) {
  return `slimefish:live:market:${marketId}`
}

function snapshotVersionKey(marketId: string) {
  return `slimefish:live:market:${marketId}:version`
}

function accountSnapshotKey(userId: string) {
  return `${AMM_ACCOUNT_CHANNEL_PREFIX}${userId}:snapshot`
}

export async function readCachedAccountSnapshot(userId: string) {
  const local = localAccountSnapshots.get(userId)
  if (local && local.expiresAt > Date.now()) { return local.snapshot }
  if (local) { localAccountSnapshots.delete(userId) }

  const redis = getRedis()
  if (!redis) { return null }
  try {
    if (redis.status === 'wait') { await redis.connect() }
    const value = await redis.get(accountSnapshotKey(userId))
    const snapshot = value ? JSON.parse(value) as AmmLiveAccountSnapshot : null
    if (snapshot) {
      localAccountSnapshots.set(userId, { expiresAt: Date.now() + LOCAL_SNAPSHOT_TTL_MS, snapshot })
    }
    return snapshot
  }
  catch {
    return null
  }
}

export async function publishAccountSnapshot(userId: string, snapshot: AmmLiveAccountSnapshot) {
  const redis = getRedis()
  if (!redis) { return }
  try {
    if (redis.status === 'wait') { await redis.connect() }
    const key = accountSnapshotKey(userId)
    const currentValue = await redis.get(key)
    const current = currentValue ? JSON.parse(currentValue) as AmmLiveAccountSnapshot : null
    const positions = new Map((current?.positions ?? []).map(position => [
      `${position.marketId}:${position.optionId}`,
      position,
    ]))
    for (const position of snapshot.positions) {
      positions.set(`${position.marketId}:${position.optionId}`, position)
    }
    const merged: AmmLiveAccountSnapshot = {
      userId,
      version: Math.max(current?.version ?? 0, snapshot.version),
      balance: snapshot.balance,
      positions: [...positions.values()],
    }
    localAccountSnapshots.set(userId, { expiresAt: Date.now() + LOCAL_SNAPSHOT_TTL_MS, snapshot: merged })
    const serialized = JSON.stringify(merged)
    await redis.set(key, serialized, 'EX', SNAPSHOT_TTL_SECONDS)
    await redis.publish(`${AMM_ACCOUNT_CHANNEL_PREFIX}${userId}`, serialized)
  }
  catch {
    // The confirmed request remains successful if live fan-out is unavailable.
  }
}

export async function readCachedLiveSnapshots(marketIds: string[]) {
  const uniqueIds = [...new Set(marketIds.filter(Boolean))]
  const now = Date.now()
  const snapshots: AmmLiveSnapshot[] = []
  const missingIds: string[] = []
  for (const marketId of uniqueIds) {
    const local = localMarketSnapshots.get(marketId)
    if (local && local.expiresAt > now) {
      snapshots.push(local.snapshot)
    }
    else {
      if (local) { localMarketSnapshots.delete(marketId) }
      missingIds.push(marketId)
    }
  }
  if (missingIds.length === 0) { return snapshots }

  const redis = getRedis()
  if (!redis) { return snapshots }
  try {
    if (redis.status === 'wait') { await redis.connect() }
    const values = await redis.mget(missingIds.map(snapshotKey))
    const redisSnapshots = values.flatMap((value) => {
      if (!value) { return [] }
      try { return [JSON.parse(value) as AmmLiveSnapshot] }
      catch { return [] }
    })
    for (const snapshot of redisSnapshots) {
      localMarketSnapshots.set(snapshot.marketId, {
        expiresAt: Date.now() + LOCAL_SNAPSHOT_TTL_MS,
        snapshot,
      })
    }
    return [...snapshots, ...redisSnapshots]
  }
  catch {
    return snapshots
  }
}

export async function publishLiveSnapshots(snapshots: AmmLiveSnapshot[]) {
  if (snapshots.length === 0) { return }
  const redis = getRedis()
  if (!redis) { return }
  try {
    if (redis.status === 'wait') { await redis.connect() }
    const publicSnapshots = snapshots.map(({ user: _user, ...snapshot }) => snapshot)
    const acceptedSnapshots = (await Promise.all(publicSnapshots.map(async (snapshot) => {
      const accepted = Number(await redis.eval(
        `local current = tonumber(redis.call('GET', KEYS[1]) or '0')
         local proposed = tonumber(ARGV[1])
         if proposed <= current then return 0 end
         redis.call('SET', KEYS[1], proposed, 'EX', ARGV[2])
         return 1`,
        1,
        snapshotVersionKey(snapshot.marketId),
        snapshot.version,
        SNAPSHOT_TTL_SECONDS,
      ))
      return accepted === 1 ? snapshot : null
    }))).filter((snapshot): snapshot is AmmLiveSnapshot => snapshot !== null)
    if (acceptedSnapshots.length === 0) { return }
    for (const snapshot of acceptedSnapshots) {
      localMarketSnapshots.set(snapshot.marketId, {
        expiresAt: Date.now() + LOCAL_SNAPSHOT_TTL_MS,
        snapshot,
      })
    }
    const pipeline = redis.pipeline()
    for (const snapshot of acceptedSnapshots) {
      pipeline.set(snapshotKey(snapshot.marketId), JSON.stringify(snapshot), 'EX', SNAPSHOT_TTL_SECONDS)
    }
    await pipeline.exec()
    await redis.publish(AMM_LIVE_CHANNEL, JSON.stringify({ snapshots: acceptedSnapshots }))
  }
  catch {
    // The request remains successful if the optional live transport is unavailable.
  }
}
