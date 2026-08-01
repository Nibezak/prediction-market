import type { Market } from '@/types'

const MAX_DISPLAY_SPREAD = 0.1

/**
 * Market odds are intentionally never rendered as absolute certainty. The
 * underlying price remains untouched for settlement and quote calculations.
 */
export function formatMarketChancePercent(value: number | null | undefined) {
  const chance = Number(value)
  if (!Number.isFinite(chance)) {
    return '50%'
  }

  return `${Math.min(99, Math.max(1, Math.round(chance)))}%`
}

export function normalizeMarketPrice(value: number | string | null | undefined) {
  if (value == null) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  const normalized = parsed > 1 && parsed <= 100
    ? parsed / 100
    : parsed

  if (normalized < 0) {
    return 0
  }
  if (normalized > 1) {
    return 1
  }

  return normalized
}

export function resolveDisplayPrice({
  bid,
  ask,
  midpoint,
  lastTrade,
  maxSpread = MAX_DISPLAY_SPREAD,
  strictFallbacks = false,
}: {
  bid: number | null | undefined
  ask: number | null | undefined
  midpoint?: number | null | undefined
  lastTrade: number | null | undefined
  maxSpread?: number
  strictFallbacks?: boolean
}) {
  const hasBid = typeof bid === 'number' && Number.isFinite(bid)
  const hasAsk = typeof ask === 'number' && Number.isFinite(ask)
  const hasMidpoint = typeof midpoint === 'number' && Number.isFinite(midpoint)
  const hasLastTrade = typeof lastTrade === 'number' && Number.isFinite(lastTrade)
  const normalizedBid = hasBid ? normalizeMarketPrice(bid as number) : null
  const normalizedAsk = hasAsk ? normalizeMarketPrice(ask as number) : null
  const normalizedMidpoint = hasMidpoint ? normalizeMarketPrice(midpoint as number) : null
  const normalizedLastTrade = hasLastTrade ? normalizeMarketPrice(lastTrade as number) : null

  if (hasBid && hasAsk) {
    const mid = normalizedMidpoint
      ?? ((normalizedAsk ?? 0) + (normalizedBid ?? 0)) / 2
    const spread = Math.max(0, (normalizedAsk ?? 0) - (normalizedBid ?? 0))
    if (spread <= maxSpread) {
      return mid
    }
    return normalizedLastTrade ?? (strictFallbacks ? null : mid)
  }

  if (hasMidpoint) {
    return normalizedMidpoint
  }

  if (hasAsk || hasBid) {
    return normalizedLastTrade ?? (strictFallbacks ? null : (normalizedAsk ?? normalizedBid))
  }

  return normalizedLastTrade
}

export function buildChanceByMarket(
  markets: Market[],
  priceOverrides: Record<string, number> = {},
) {
  function getPrice(market: Market) {
    const override = priceOverrides[market.condition_id]
    return normalizeMarketPrice(override ?? market.price ?? market.probability) ?? 0
  }

  const chanceByMarket = markets.reduce<Record<string, number>>((acc, market) => {
    acc[market.condition_id] = getPrice(market) * 100
    return acc
  }, {})

  if (markets.length <= 1) {
    return chanceByMarket
  }

  const totalChance = markets.reduce(
    (total, market) => total + Math.max(0, chanceByMarket[market.condition_id] ?? 0),
    0,
  )
  const fallbackChance = 100 / markets.length

  return Object.fromEntries(markets.map(market => [
    market.condition_id,
    totalChance > 0
      ? (Math.max(0, chanceByMarket[market.condition_id] ?? 0) / totalChance) * 100
      : fallbackChance,
  ]))
}
