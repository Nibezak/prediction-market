import { useQuery } from '@tanstack/react-query'

interface PortfolioValueResult {
  value: number
  text: string
  isLoading: boolean
  isFetching: boolean
}

interface PortfolioValueOptions {
  useDefaultUser?: boolean
}

export function usePortfolioValue(
  walletAddress?: string | null,
  options: PortfolioValueOptions = {},
): PortfolioValueResult {
  const {
    data,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ['portfolio-value', 'me'],
    staleTime: 'static',
    gcTime: 5 * 60 * 1000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<number> => {
      try {
        const response = await fetch(`/api/amm/users/me/stats`)
        if (!response.ok) {
          return 0
        }
        const body = await response.json()
        return body?.data?.netWorth || 0
      }
      catch (e) {
        return 0
      }
    },
  })

  const value = data ?? 0
  const text = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const isInitialLoading = isLoading && !data

  return {
    value,
    text,
    isLoading: isInitialLoading,
    isFetching,
  }
}
