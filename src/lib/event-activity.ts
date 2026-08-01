import type { ActivityOrder } from '@/types'
import { MICRO_UNIT } from '@/lib/constants'
import { getPublicAssetUrl } from '@/lib/storage'
import { getRedis } from '@/lib/redis'
import { signSlimefishBackendRequest } from '@/lib/slimefish-backend-auth'

export const EVENT_ACTIVITY_CHANNEL = 'slimefish:live:activity'
const ACTIVITY_TTL_SECONDS = 60 * 60

function activityKey(marketId: string) {
  return `slimefish:live:activity:${marketId}`
}

export async function readCachedEventActivities(marketIds: string[]): Promise<ActivityOrder[]> {
  const redis = getRedis()
  if (!redis || marketIds.length === 0) return []
  try {
    if (redis.status === 'wait') await redis.connect()
    const values = await redis.mget(marketIds.map(activityKey))
    return values.flatMap((value) => {
      if (!value) return []
      try { return JSON.parse(value) as ActivityOrder[] }
      catch { return [] }
    }).sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)).slice(0, 100)
  }
  catch { return [] }
}

export async function publishEventActivities(marketIds: string[], activities: ActivityOrder[]) {
  const redis = getRedis()
  if (!redis) return
  try {
    if (redis.status === 'wait') await redis.connect()
    const pipeline = redis.pipeline()
    for (const marketId of marketIds) {
      const marketActivities = activities.filter(activity => activity.market.condition_id === marketId)
      pipeline.set(activityKey(marketId), JSON.stringify(marketActivities), 'EX', ACTIVITY_TTL_SECONDS)
    }
    await pipeline.exec()
    await redis.publish(EVENT_ACTIVITY_CHANNEL, JSON.stringify({ marketIds, activities }))
  }
  catch {}
}

function normalizeAvatarUrl(image: string | null | undefined) {
  if (!image) return ''
  if (image.startsWith('http')) return image
  return getPublicAssetUrl(image)
}

export async function loadEventActivities(marketIds: string[], signal?: AbortSignal): Promise<ActivityOrder[]> {
  const ammBaseUrl = process.env.AMM_BASE_URL || 'http://localhost:8000/api/v1'
  const tellwiseSecret = process.env.TELLWISE_SECRET?.trim() || ''

  if (!tellwiseSecret) {
    throw new Error('SlimefishBackend service credentials are not configured.')
  }

  const responses = await Promise.all(marketIds.map(async (marketId) => {
    try {
      const timeoutSignal = AbortSignal.timeout(6_000)
      const requestSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal
      const url = `${ammBaseUrl}/markets/${encodeURIComponent(marketId)}/activity`
      const response = await fetch(url, {
        cache: 'no-store',
        headers: signSlimefishBackendRequest({ url, headers: {
          'x-tellwise-secret': tellwiseSecret,
        } }),
        signal: requestSignal,
      })
      if (!response.ok) return []
      const payload = await response.json()
      return Array.isArray(payload.data) ? payload.data : []
    } catch {
      return []
    }
  }))

  const activities: ActivityOrder[] = []

  for (const activity of responses.flat()) {
    if (activity.type !== 'TRADE_TRANSACTION' || !activity.transactions) continue

    for (const tx of activity.transactions) {
      const isBuy = tx.type === 'TRADE_BUY'
      const initiator = tx.initiator || {}
      let amount = '0'
      let totalValue = 0

      if (tx.entries) {
        const optionEntries = tx.entries.filter((entry: any) =>
          entry.assetType === 'MARKET_OPTION'
          && (!activity.option?.id || entry.assetId === activity.option.id))
        const optionEntry = optionEntries.sort((left: any, right: any) =>
          Math.abs(Number(right.amount)) - Math.abs(Number(left.amount)))[0]
        const primaryEntry = tx.entries.find((entry: any) =>
          entry.assetType === 'CURRENCY' && entry.assetId === 'PRIMARY')

        if (optionEntry) amount = Math.abs(Number(optionEntry.amount)).toString()
        if (primaryEntry) totalValue = Math.abs(Number(primaryEntry.amount))
      }

      const shareAmount = Number(amount)
      const price = shareAmount > 0 ? totalValue / shareAmount : 0
      const optionName = String(activity.option?.name || 'Outcome')
      const outcomeIndex = optionName.trim().toLowerCase() === 'no' ? 1 : 0

      activities.push({
        id: tx.id,
        type: isBuy ? 'buy' : 'sell',
        user: {
          id: initiator.id || 'unknown',
          username: initiator.username || initiator.displayName || 'trader',
          address: initiator.id || 'unknown',
          image: normalizeAvatarUrl(initiator.avatarUrl),
          created_at: initiator.createdAt,
        },
        side: isBuy ? 'buy' : 'sell',
        amount: Math.round(shareAmount * MICRO_UNIT).toString(),
        price: price.toString(),
        outcome: { index: outcomeIndex, text: optionName },
        market: {
          condition_id: tx.marketId,
          title: tx.market?.question || activity.market?.question || 'Market',
          slug: tx.market?.slug || activity.market?.slug || tx.marketId,
          icon_url: '',
        },
        total_value: Math.round(totalValue * MICRO_UNIT),
        created_at: tx.createdAt,
        status: 'completed',
        tx_hash: tx.id,
      })
    }
  }

  const result = activities
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 100)
  await publishEventActivities(marketIds, result)
  return result
}
