import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { OUTCOME_INDEX } from '@/lib/constants'
import { fetchUserPositionsForMarket } from '@/lib/data-api/user'
import { useAmmLiveAccount } from '@/hooks/useAmmLiveAccount'

type OrderPanelPosition = {
  market?: { condition_id?: string | null } | null
  outcome_index?: number | null
  outcome_text?: string | null
  total_shares?: number | null
  total_position_cost?: number | null
  option_id?: string | null
}

export function useEventOrderPanelPositions({
  makerAddress,
  conditionId,
  eventConditionIds,
  userId,
}: {
  makerAddress: string | null
  conditionId: string | undefined
  eventConditionIds?: string[]
  userId?: string | null
}) {
  const isSlimefishBackendAmm = process.env.NEXT_PUBLIC_USE_SLIMEFISH_BACKEND_AMM !== 'false'
  const liveAccount = useAmmLiveAccount(isSlimefishBackendAmm && Boolean(userId), userId)
  const eventConditionKey = [...new Set(eventConditionIds ?? [])].sort().join(',')
  const positionsQuery = useQuery({
    queryKey: ['order-panel-user-positions', userId, makerAddress, eventConditionKey || conditionId],
    enabled: Boolean(!isSlimefishBackendAmm && conditionId && makerAddress),
    staleTime: 30_000,
    gcTime: 1000 * 60 * 5,
    refetchOnWindowFocus: !isSlimefishBackendAmm,
    queryFn: async ({ signal }) => {
      return fetchUserPositionsForMarket({
        pageParam: 0,
        userAddress: makerAddress!,
        conditionId,
        status: 'active',
        signal,
      })
    },
  })

  const livePositions = useMemo<OrderPanelPosition[]>(() => {
    if (!isSlimefishBackendAmm || !liveAccount) return []
    const allowedConditionIds = new Set(eventConditionIds?.length ? eventConditionIds : conditionId ? [conditionId] : [])
    return liveAccount.positions
      .filter(position => allowedConditionIds.has(position.marketId) && position.quantity > 0)
      .map(position => ({
        market: { condition_id: position.marketId },
        option_id: position.optionId,
        outcome_index: position.outcomeIndex,
        outcome_text: position.optionName,
        total_shares: position.quantity,
      }))
  }, [conditionId, eventConditionIds, isSlimefishBackendAmm, liveAccount])

  const aggregatedPositionShares = useMemo(() => {
    const queriedPositions = positionsQuery.data as OrderPanelPosition[] | undefined
    const allowedConditionIds = new Set(eventConditionIds?.length ? eventConditionIds : conditionId ? [conditionId] : [])
    const byPosition = new Map<string, OrderPanelPosition>()
    for (const position of queriedPositions ?? []) {
      byPosition.set(`${position.market?.condition_id}:${position.option_id ?? position.outcome_index}`, position)
    }
    for (const position of livePositions) {
      byPosition.set(`${position.market?.condition_id}:${position.option_id ?? position.outcome_index}`, position)
    }
    const positions = [...byPosition.values()]
    if (!positions?.length) {
      return null
    }

    return positions.reduce<Record<string, Record<typeof OUTCOME_INDEX.YES | typeof OUTCOME_INDEX.NO, number>>>((acc, position) => {
      const resolvedConditionId = position.market?.condition_id
      const quantity = typeof position.total_shares === 'number' ? position.total_shares : 0
      if (!resolvedConditionId || quantity <= 0) {
        return acc
      }

      const normalizedOutcome = position.outcome_text?.toLowerCase()
      const explicitOutcomeIndex = typeof position.outcome_index === 'number' ? position.outcome_index : undefined
      const resolvedOutcomeIndex = explicitOutcomeIndex ?? (
        normalizedOutcome === 'no'
          ? OUTCOME_INDEX.NO
          : OUTCOME_INDEX.YES
      )

      if (!acc[resolvedConditionId]) {
        acc[resolvedConditionId] = {
          [OUTCOME_INDEX.YES]: 0,
          [OUTCOME_INDEX.NO]: 0,
        }
      }

      const bucket = resolvedOutcomeIndex === OUTCOME_INDEX.NO ? OUTCOME_INDEX.NO : OUTCOME_INDEX.YES
      acc[resolvedConditionId][bucket] += quantity
      return acc
    }, {})
  }, [conditionId, eventConditionIds, livePositions, positionsQuery.data])

  const authoritativePositionsQuery = isSlimefishBackendAmm
    ? {
        ...positionsQuery,
        data: livePositions,
        isPending: Boolean(userId && !liveAccount),
        isLoading: Boolean(userId && !liveAccount),
        isFetching: false,
      }
    : positionsQuery

  return {
    positionsQuery: authoritativePositionsQuery,
    aggregatedPositionShares,
  }
}
