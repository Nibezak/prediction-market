import type { TimeRange } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventPriceHistory'
import type { Event } from '@/types'
import { useMemo } from 'react'
import { useEventLastTrades } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventLastTrades'
import { useEventMarketQuotes } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventMidPrices'
import {
  buildMarketTargets,
  useEventPriceHistory,
} from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventPriceHistory'
import {
  computeChanceChanges,
  resolveEventHistoryEndAt,
} from '@/app/[locale]/(platform)/event/[slug]/_utils/EventChartUtils'
import { useAmmLiveMarkets } from '@/hooks/useAmmLiveMarkets'
import { resolveDisplayPrice } from '@/lib/market-chance'

interface UseEventMarketChanceDataParams {
  event: Event
  range: TimeRange
  enabled?: boolean
  includePriceHistory?: boolean
}

function normalizeMutuallyExclusiveChances(values: Record<string, number>, marketIds: string[]) {
  if (marketIds.length <= 1) {
    return values
  }
  const total = marketIds.reduce((sum, marketId) => sum + Math.max(0, values[marketId] ?? 0), 0)
  if (!(total > 0)) {
    const equalChance = 100 / marketIds.length
    return { ...values, ...Object.fromEntries(marketIds.map(marketId => [marketId, equalChance])) }
  }
  return {
    ...values,
    ...Object.fromEntries(marketIds.map(marketId => [marketId, (Math.max(0, values[marketId] ?? 0) / total) * 100])),
  }
}

export function useEventMarketChanceData({
  event,
  range,
  enabled = true,
  includePriceHistory = true,
}: UseEventMarketChanceDataParams) {
  const isSlimefishBackendAmm = process.env.NEXT_PUBLIC_USE_SLIMEFISH_BACKEND_AMM === 'true'
  const eventHistoryEndAt = useMemo(
    () => resolveEventHistoryEndAt(event),
    [event],
  )
  const yesMarketTargets = useMemo(
    () => buildMarketTargets(event.markets),
    [event.markets],
  )
  const liveSnapshotsByMarket = useAmmLiveMarkets(
    yesMarketTargets.map(target => target.conditionId),
    enabled,
  )
  const yesPriceHistory = useEventPriceHistory({
    eventId: event.id,
    range,
    targets: includePriceHistory && enabled ? yesMarketTargets : [],
    eventCreatedAt: event.created_at,
    eventResolvedAt: eventHistoryEndAt,
  })
  const fallbackLastTradesByMarket = useEventLastTrades(
    enabled && !includePriceHistory && !isSlimefishBackendAmm ? yesMarketTargets : [],
  )
  const marketLastTradesByMarket = includePriceHistory
    ? yesPriceHistory.latestRawPrices
    : fallbackLastTradesByMarket
  const marketQuotesByMarket = useEventMarketQuotes(yesMarketTargets, { enabled })
  const displayChanceByMarket = useMemo(() => {
    const marketIds = new Set([
      ...event.markets.map(market => market.condition_id).filter(Boolean),
      ...Object.keys(marketQuotesByMarket),
      ...Object.keys(marketLastTradesByMarket),
    ])
    const entries: Array<[string, number]> = []

    marketIds.forEach((marketId) => {
      const target = yesMarketTargets.find(item => item.conditionId === marketId)
      const liveOption = target
        ? liveSnapshotsByMarket[marketId]?.options.find(option => option.id === target.tokenId)
        : null
      const quote = marketQuotesByMarket[marketId]
      const lastTrade = marketLastTradesByMarket[marketId]
      const market = event.markets.find(m => m.condition_id === marketId)
      const yesOutcome = market?.outcomes?.find(o => o.outcome_index === 0)
      const outcomeBuyPrice = typeof yesOutcome?.buy_price === 'number' && Number.isFinite(yesOutcome.buy_price)
        ? yesOutcome.buy_price
        : typeof market?.price === 'number' && Number.isFinite(market.price)
          ? market.price
          : null

      const resolvedDisplayPrice = resolveDisplayPrice({
        bid: quote?.bid ?? null,
        ask: quote?.ask ?? null,
        midpoint: quote?.mid ?? null,
        lastTrade,
      })
      const marketProbabilityPrice = typeof market?.probability === 'number' && Number.isFinite(market.probability)
        ? market.probability / 100
        : null
      let displayPrice = isSlimefishBackendAmm
        ? liveOption?.probability ?? marketProbabilityPrice ?? resolvedDisplayPrice ?? outcomeBuyPrice
        : outcomeBuyPrice ?? liveOption?.probability ?? resolvedDisplayPrice

      if (displayPrice != null) {
        entries.push([marketId, displayPrice > 1 ? displayPrice : displayPrice * 100])
      }
    })

    return normalizeMutuallyExclusiveChances(
      Object.fromEntries(entries),
      event.markets.map(market => market.condition_id).filter(Boolean),
    )
  }, [marketLastTradesByMarket, marketQuotesByMarket, event.markets, liveSnapshotsByMarket, yesMarketTargets])
  const normalizedYesPriceHistory = useMemo(() => {
    const marketIds = event.markets.map(market => market.condition_id).filter(Boolean)
    const normalizedHistory = yesPriceHistory.normalizedHistory.map((point) => {
      const current = Object.fromEntries(marketIds.map(marketId => [marketId, typeof point[marketId] === 'number' ? point[marketId] as number : 0]))
      return { ...point, ...normalizeMutuallyExclusiveChances(current, marketIds) }
    })
    const liveValues = Object.fromEntries(marketIds.flatMap((marketId) => {
      const target = yesMarketTargets.find(item => item.conditionId === marketId)
      const probability = target
        ? liveSnapshotsByMarket[marketId]?.options.find(option => option.id === target.tokenId)?.probability
        : undefined
      return typeof probability === 'number' ? [[marketId, probability * 100]] : []
    }))
    const latestSnapshot = normalizeMutuallyExclusiveChances(
      { ...yesPriceHistory.latestSnapshot, ...liveValues },
      marketIds,
    )
    if (Object.keys(liveValues).length > 0) {
      const previous = normalizedHistory.at(-1)
      const nextPoint = { ...(previous ?? {}), ...latestSnapshot, date: new Date() }
      normalizedHistory.push(nextPoint)
    }
    return {
      normalizedHistory,
      latestSnapshot,
      latestRawPrices: Object.fromEntries(Object.entries(latestSnapshot).map(([key, value]) => [key, value / 100])),
    }
  }, [event.markets, liveSnapshotsByMarket, yesMarketTargets, yesPriceHistory])
  const chanceChangeByMarket = useMemo(() => {
    if (!includePriceHistory) {
      return {}
    }

    return computeChanceChanges(normalizedYesPriceHistory.normalizedHistory)
  }, [includePriceHistory, normalizedYesPriceHistory.normalizedHistory])

  return {
    displayChanceByMarket,
    chanceChangeByMarket,
    marketQuotesByMarket,
    liveSnapshotsByMarket,
    yesMarketTargets,
    yesPriceHistory: normalizedYesPriceHistory,
  }
}
