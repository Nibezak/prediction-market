import type { Event } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { OUTCOME_INDEX } from '@/lib/constants'

export interface SharesByCondition {
  [conditionId: string]: {
    [OUTCOME_INDEX.YES]: number
    [OUTCOME_INDEX.NO]: number
  }
}

interface UseUserShareBalancesOptions {
  event?: Event
  ownerAddress?: `0x${string}` | null
}

export function useUserShareBalances({ event, ownerAddress }: UseUserShareBalancesOptions) {
  const outcomeDescriptors = useMemo(() => {
    if (!event?.markets?.length) {
      return []
    }

    return event.markets.flatMap(market =>
      market.outcomes.map(outcome => ({
        conditionId: market.condition_id,
        outcomeIndex: outcome.outcome_index ?? OUTCOME_INDEX.YES,
        tokenId: outcome.token_id,
      })),
    )
  }, [event])

  const descriptorKey = useMemo(() => outcomeDescriptors.map(descriptor => `${descriptor.conditionId}:${descriptor.tokenId}`).join('|'), [outcomeDescriptors])
  const isQueryEnabled = Boolean(ownerAddress && outcomeDescriptors.length)

  const query = useQuery({
    queryKey: ['user-conditional-shares', ownerAddress, event?.slug, descriptorKey],
    enabled: isQueryEnabled,
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<SharesByCondition> => {
      if (!isQueryEnabled) {
        return {}
      }

      try {
        const res = await fetch(`/api/amm/users/me/positions`)
        if (!res.ok) {
          return {}
        }

        const json = await res.json()
        const positions = json?.data || []

        return outcomeDescriptors.reduce<SharesByCondition>((acc, descriptor) => {
          if (!acc[descriptor.conditionId]) {
            acc[descriptor.conditionId] = {
              [OUTCOME_INDEX.YES]: 0,
              [OUTCOME_INDEX.NO]: 0,
            }
          }

          // Find if the user has a position for this exact outcome token in Play Money
          const pos = positions.find((p: any) => p.optionId === descriptor.tokenId)

          if (pos) {
            acc[descriptor.conditionId][descriptor.outcomeIndex as keyof typeof acc[string]] = Number(pos.quantity || 0)
          }

          return acc
        }, {})
      }
      catch (err) {
        console.error('Failed to fetch user positions from AMM', err)
        return {}
      }
    },
  })

  return {
    ...query,
    sharesByCondition: query.data,
  }
}
