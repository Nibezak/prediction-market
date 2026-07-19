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
import { resolveDisplayPrice } from '@/lib/market-chance'

interface UseEventMarketChanceDataParams {
  event: Event
  range: TimeRange
  enabled?: boolean
  includePriceHistory?: boolean
}

export function useEventMarketChanceData({
  event,
  range,
  enabled = true,
  includePriceHistory = true,
}: UseEventMarketChanceDataParams) {
  const eventHistoryEndAt = useMemo(
    () => resolveEventHistoryEndAt(event),
    [event],
  )
  const yesMarketTargets = useMemo(
    () => buildMarketTargets(event.markets),
    [event.markets],
  )
  const yesPriceHistory = useEventPriceHistory({
    eventId: event.id,
    range,
    targets: includePriceHistory && enabled ? yesMarketTargets : [],
    eventCreatedAt: event.created_at,
    eventResolvedAt: eventHistoryEndAt,
  })
  const fallbackLastTradesByMarket = useEventLastTrades(
    enabled && !includePriceHistory ? yesMarketTargets : [],
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
      const quote = marketQuotesByMarket[marketId]
      const lastTrade = marketLastTradesByMarket[marketId]
      let displayPrice = resolveDisplayPrice({
        bid: quote?.bid ?? null,
        ask: quote?.ask ?? null,
        midpoint: quote?.mid ?? null,
        lastTrade,
      })

      if (displayPrice == null) {
        const market = event.markets.find(m => m.condition_id === marketId)
        if (market && typeof market.price === 'number') {
          displayPrice = market.price
        }
        else if (market) {
          const yesOutcome = market.outcomes?.find(o => o.outcome_index === 0)
          if (yesOutcome && typeof yesOutcome.buy_price === 'number') {
            displayPrice = yesOutcome.buy_price
          }
          else {
            displayPrice = 0.5 // Default to 50% chance if everything is null
          }
        }
      }

      if (displayPrice != null) {
        entries.push([marketId, displayPrice * 100])
      }
    })

    return Object.fromEntries(entries)
  }, [marketLastTradesByMarket, marketQuotesByMarket, event.markets])
  const chanceChangeByMarket = useMemo(() => {
    if (!includePriceHistory) {
      return {}
    }

    return computeChanceChanges(yesPriceHistory.normalizedHistory)
  }, [includePriceHistory, yesPriceHistory.normalizedHistory])

  return {
    displayChanceByMarket,
    chanceChangeByMarket,
    marketQuotesByMarket,
    yesMarketTargets,
    yesPriceHistory,
  }
}
