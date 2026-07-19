import type { UserOpenOrder } from '@/types'
import { useInfiniteQuery } from '@tanstack/react-query'

interface FetchUserOpenOrdersParams {
  pageParam: string
  eventSlug: string
  conditionId: string
  signal?: AbortSignal
}

interface OpenOrdersPage {
  data: UserOpenOrder[]
  next_cursor: string
}

interface UseUserOpenOrdersArgs {
  userId?: string | null
  eventSlug?: string
  conditionId?: string
  enabled?: boolean
}

export function buildUserOpenOrdersQueryKey(userId?: string | null, eventSlug?: string, conditionId?: string) {
  return ['user-open-orders', userId, eventSlug, conditionId] as const
}

export function useUserOpenOrdersQuery({
  userId,
  eventSlug,
  conditionId,
  enabled = true,
}: UseUserOpenOrdersArgs) {
  return useInfiniteQuery<OpenOrdersPage>({
    queryKey: buildUserOpenOrdersQueryKey(userId, eventSlug, conditionId),
    queryFn: ({ pageParam = 'MA==', signal }) =>
      fetchUserOpenOrders({
        pageParam: pageParam as string,
        eventSlug: eventSlug ?? '',
        conditionId: conditionId ?? '',
        signal,
      }),
    getNextPageParam: (lastPage) => {
      if (lastPage?.next_cursor && lastPage.next_cursor !== 'LTE=') {
        return lastPage.next_cursor
      }
      return undefined
    },
    enabled: Boolean(enabled && userId && eventSlug),
    initialPageParam: 'MA==',
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  })
}

export async function fetchUserOpenOrders({
  pageParam,
  eventSlug,
  conditionId,
  signal,
}: FetchUserOpenOrdersParams): Promise<OpenOrdersPage> {
  // AMMs do not have limit open orders
  return { data: [], next_cursor: '' }
}
