import type { ActivitySort, ActivityTypeFilter } from '@/app/[locale]/(platform)/profile/_types/PublicActivityTypes'
import type { DataApiActivity } from '@/lib/data-api/user'
import type { ActivityOrder } from '@/types'
import { useInfiniteQuery } from '@tanstack/react-query'
import { resolveActivitySort, resolveActivityTypeParams } from '@/app/[locale]/(platform)/profile/_utils/PublicActivityUtils'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { mapDataApiActivityToActivityOrder } from '@/lib/data-api/user'

async function fetchUserActivity({
  dataUrl,
  pageParam,
  userAddress,
  typeFilter,
  sortFilter,
  signal,
}: {
  dataUrl: string
  pageParam: number
  userAddress: string
  typeFilter: ActivityTypeFilter
  sortFilter: ActivitySort
  signal?: AbortSignal
}): Promise<ActivityOrder[]> {
  const isPlayMoneyAmm = process.env.NEXT_PUBLIC_USE_PLAY_MONEY_AMM === 'true'
  if (isPlayMoneyAmm) {
    if (pageParam > 0) return []
    const response = await fetch('/api/amm/users/me/transactions', { signal })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error || 'Failed to load transaction history.')
    const rows = Array.isArray(payload?.data) ? payload.data : []
    return rows.map((transaction: any) => {
      const transactionType = String(transaction.type || '')
      const isSettlement = transactionType === 'TRADE_WIN' || transactionType === 'TRADE_LOSS'
      const optionEntry = transaction.entries?.find((entry: any) => entry.assetType === 'MARKET_OPTION')
      const option = transaction.options?.find((candidate: any) => candidate.id === optionEntry?.assetId)
        || transaction.options?.[0]
      const costEntry = transaction.entries?.find((entry: any) => entry.assetType === 'CURRENCY')
      const shareEntry = transaction.entries?.find((entry: any) => entry.assetType === 'MARKET_OPTION'
        && entry.assetId === option?.id
        && (isSettlement
          ? entry.fromAccountId === transaction.userAccountId
          : entry.toAccountId === transaction.userAccountId))
      const cost = Number(costEntry?.amount || 0)
      const shares = Number(shareEntry?.amount || 0)
      const side = transactionType === 'TRADE_SELL' ? 'sell' : 'buy'
      const activityType = transactionType === 'TRADE_WIN'
        ? 'redeem'
        : transactionType === 'TRADE_LOSS'
          ? 'loss'
          : side
      return {
        id: transaction.id,
        type: activityType,
        user: {
          id: transaction.initiator?.id || userAddress,
          username: transaction.initiator?.username || 'Slimefish user',
          address: transaction.initiator?.address || '',
          image: transaction.initiator?.avatarUrl || '',
        },
        side,
        amount: String(shares * 1_000_000),
        price: shares > 0 ? String(cost / shares) : '0',
        outcome: { index: String(option?.name).toLowerCase() === 'no' ? 1 : 0, text: option?.name || 'Outcome' },
        market: {
          condition_id: transaction.market?.id,
          title: transaction.market?.question || 'Prediction market',
          slug: transaction.market?.slug || transaction.market?.id,
          icon_url: '',
          event: transaction.market?.event?.slug
            ? { slug: transaction.market.event.slug, show_market_icons: false }
            : undefined,
        },
        total_value: cost * 1_000_000,
        created_at: transaction.createdAt,
        status: 'filled',
      } satisfies ActivityOrder
    })
  }

  const { sortBy, sortDirection } = resolveActivitySort(sortFilter)
  const { type, side } = resolveActivityTypeParams(typeFilter)

  const params = new URLSearchParams({
    user: userAddress,
    limit: '100',
    offset: pageParam.toString(),
    sortBy,
    sortDirection,
  })
  if (type) {
    params.set('type', type)
  }
  if (side) {
    params.set('side', side)
  }

  const response = await fetch(`${dataUrl}/activity?${params.toString()}`, { signal })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null)
    const errorMessage = errorBody?.error || 'Failed to load activity.'
    throw new Error(errorMessage)
  }

  const result = await response.json()
  if (!Array.isArray(result)) {
    throw new TypeError('Unexpected response from data service.')
  }

  return (result as DataApiActivity[]).map(mapDataApiActivityToActivityOrder)
}

export function usePublicActivityQuery({
  userAddress,
  typeFilter,
  sortFilter,
}: {
  userAddress: string
  typeFilter: ActivityTypeFilter
  sortFilter: ActivitySort
}) {
  const { dataUrl } = usePublicRuntimeConfig()

  return useInfiniteQuery<ActivityOrder[]>({
    queryKey: ['user-activity', dataUrl, userAddress, typeFilter, sortFilter],
    queryFn: ({ pageParam = 0, signal }) => fetchUserActivity({
      dataUrl,
      pageParam: pageParam as number,
      userAddress,
      typeFilter,
      sortFilter,
      signal,
    }),
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length === 100) {
        return allPages.reduce((total, page) => total + page.length, 0)
      }
      return undefined
    },
    initialPageParam: 0,
    enabled: Boolean(userAddress),
    staleTime: 1000 * 60,
    gcTime: 1000 * 60 * 5,
  })
}
