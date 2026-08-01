import type { Event, Market } from '@/types'
import { OUTCOME_INDEX } from '@/lib/constants'

function isMarketResolved(market: Market | null | undefined) {
  return Boolean(market?.is_resolved || market?.condition?.resolved)
}

export function resolveMarketSelectionScore(market: Market) {
  if (Number.isFinite(market.probability)) {
    return market.probability
  }

  const yesOutcome = market.outcomes.find(outcome => outcome.outcome_index === OUTCOME_INDEX.YES)
  return Number.isFinite(yesOutcome?.buy_price) ? Number(yesOutcome?.buy_price) : 0
}

export function resolveDefaultEventMarket(markets: Event['markets']) {
  const available = markets.filter(market => market.is_active && !isMarketResolved(market))
  const unresolved = available.length > 0
    ? available
    : markets.filter(market => !isMarketResolved(market))
  const candidates = unresolved.length > 0 ? unresolved : markets

  return candidates.reduce<Event['markets'][number] | undefined>((best, market) => {
    if (!best || resolveMarketSelectionScore(market) > resolveMarketSelectionScore(best)) {
      return market
    }
    return best
  }, undefined)
}
