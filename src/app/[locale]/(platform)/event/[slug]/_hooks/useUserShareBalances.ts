import type { Event } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useAmmLiveAccount } from '@/hooks/useAmmLiveAccount'
import { authClient } from '@/lib/auth-client'
import { OUTCOME_INDEX } from '@/lib/constants'
import { useUser } from '@/stores/useUser'

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
  const user = useUser()
  const { data: authSession, isPending: isAuthSessionPending } = authClient.useSession()
  const isSlimefishBackendAmm = process.env.NEXT_PUBLIC_USE_SLIMEFISH_BACKEND_AMM === 'true'
  const authenticatedUserId = !isAuthSessionPending
    && user
    && authSession?.user?.id === user.id
    ? user.id
    : null
  const liveAccount = useAmmLiveAccount(isSlimefishBackendAmm && Boolean(authenticatedUserId), authenticatedUserId)
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
  const isQueryEnabled = Boolean(!isSlimefishBackendAmm && ownerAddress && outcomeDescriptors.length)

  const query = useQuery({
    queryKey: ['user-conditional-shares', ownerAddress, event?.slug, descriptorKey],
    enabled: isQueryEnabled,
    staleTime: 10_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: isSlimefishBackendAmm ? false : 10_000,
    refetchIntervalInBackground: !isSlimefishBackendAmm,
    refetchOnWindowFocus: !isSlimefishBackendAmm,
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

          // Find if the user has a position for this exact outcome token in Slimefish ledger
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

  const sharesByCondition = useMemo(() => {
    const next: SharesByCondition = Object.fromEntries(
      Object.entries(query.data ?? {}).map(([conditionId, shares]) => [conditionId, { ...shares }]),
    )
    if (!isSlimefishBackendAmm || !liveAccount) return next

    for (const descriptor of outcomeDescriptors) {
      if (!next[descriptor.conditionId]) {
        next[descriptor.conditionId] = {
          [OUTCOME_INDEX.YES]: 0,
          [OUTCOME_INDEX.NO]: 0,
        }
      }
      const position = liveAccount.positions.find(item => (
        item.marketId === descriptor.conditionId && item.optionId === descriptor.tokenId
      ))
      if (position) {
        next[descriptor.conditionId][descriptor.outcomeIndex as keyof typeof next[string]] = position.quantity
      }
    }
    return next
  }, [isSlimefishBackendAmm, liveAccount, outcomeDescriptors, query.data])

  return {
    ...query,
    sharesByCondition,
  }
}
