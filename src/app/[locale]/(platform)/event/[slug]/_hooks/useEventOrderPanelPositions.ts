import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { OUTCOME_INDEX } from '@/lib/constants'
import { fetchUserPositionsForMarket } from '@/lib/data-api/user'

type OrderPanelPosition = {
  market?: { condition_id?: string | null } | null
  outcome_index?: number | null
  outcome_text?: string | null
  total_shares?: number | null
}

export function useEventOrderPanelPositions({
  makerAddress,
  conditionId,
}: {
  makerAddress: string | null
  conditionId: string | undefined
}) {
  const isPlayMoneyAmm = process.env.NEXT_PUBLIC_USE_PLAY_MONEY_AMM === 'true'
  const positionsQuery = useQuery({
    queryKey: ['order-panel-user-positions', makerAddress, conditionId],
    enabled: Boolean(conditionId && (isPlayMoneyAmm || makerAddress)),
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
    refetchInterval: conditionId ? 15_000 : false,
    refetchIntervalInBackground: true,
    queryFn: async ({ signal }) => {
      if (isPlayMoneyAmm) {
        const response = await fetch('/api/amm/users/me/positions?status=active&limit=100', { signal })
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.error || 'Failed to load positions')
        }
        const rows = Array.isArray(payload?.data) ? payload.data : []
        return rows
          .filter((position: any) => position.marketId === conditionId)
          .map((position: any) => ({
            market: { condition_id: position.marketId },
            outcome_index: Array.isArray(position.market?.options)
              ? Math.max(0, position.market.options.findIndex((option: any) => option.id === position.optionId))
              : (String(position.option?.name).toLowerCase() === 'no' ? OUTCOME_INDEX.NO : OUTCOME_INDEX.YES),
            outcome_text: position.option?.name,
            total_shares: Number(position.quantity || 0),
          }))
      }
      return fetchUserPositionsForMarket({
        pageParam: 0,
        userAddress: makerAddress!,
        conditionId,
        status: 'active',
        signal,
      })
    },
  })

  const aggregatedPositionShares = useMemo(() => {
    const positions = positionsQuery.data as OrderPanelPosition[] | undefined
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
  }, [positionsQuery.data])

  return {
    positionsQuery,
    aggregatedPositionShares,
  }
}
