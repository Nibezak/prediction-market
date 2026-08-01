import type { MarketTokenTarget } from '@/app/[locale]/(platform)/event/[slug]/_hooks/useEventPriceHistory'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAmmLiveMarkets } from '@/hooks/useAmmLiveMarkets'

const LAST_TRADE_REFRESH_INTERVAL_MS = 60_000

async function fetchLastTradesByMarket(targets: MarketTokenTarget[]) {
  const uniqueConditionIds = Array.from(new Set(targets.map(target => target.conditionId).filter(Boolean)))

  if (!uniqueConditionIds.length) {
    return {}
  }

  const ammMaps = new Map<string, any>()

  for (const conditionId of uniqueConditionIds) {
    try {
      // Use internal proxy
      const res = await fetch(`/api/amm/markets/${conditionId}?extended=true`)
      if (res.ok) {
        const mkt = await res.json()
        if (mkt?.data) {
          ammMaps.set(conditionId, mkt.data)
        }
      }
    }
    catch (err) {
      // ignore
    }
  }

  return targets.reduce<Record<string, number>>((acc, target) => {
    const mkt = ammMaps.get(target.conditionId)
    if (mkt && mkt.options && Array.isArray(mkt.options)) {
      const opt = mkt.options.find((o: any) => o.id === target.tokenId)
      if (opt && opt.probability) {
        acc[target.conditionId] = Number(opt.probability)
      }
    }
    return acc
  }, {})
}

export function useEventLastTrades(targets: MarketTokenTarget[]) {
  const isSlimefishBackendAmm = process.env.NEXT_PUBLIC_USE_SLIMEFISH_BACKEND_AMM === 'true'
  const tokenSignature = useMemo(
    () => targets.map(target => `${target.conditionId}:${target.tokenId}`).sort().join(','),
    [targets],
  )

  const { data } = useQuery({
    queryKey: ['event-last-trades', tokenSignature],
    queryFn: () => fetchLastTradesByMarket(targets),
    enabled: targets.length > 0 && !isSlimefishBackendAmm,
    staleTime: 'static',
    gcTime: LAST_TRADE_REFRESH_INTERVAL_MS,
    refetchInterval: isSlimefishBackendAmm ? false : LAST_TRADE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: !isSlimefishBackendAmm,
    placeholderData: keepPreviousData,
  })

  const liveSnapshots = useAmmLiveMarkets(
    targets.map(target => target.conditionId),
    isSlimefishBackendAmm,
  )
  return useMemo(() => {
    if (!isSlimefishBackendAmm) return data ?? {}
    return targets.reduce<Record<string, number>>((acc, target) => {
      const option = liveSnapshots[target.conditionId]?.options.find(item => item.id === target.tokenId)
      if (option) acc[target.conditionId] = option.probability
      return acc
    }, {})
  }, [data, isSlimefishBackendAmm, liveSnapshots, targets])
}
