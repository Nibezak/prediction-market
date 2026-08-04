import { useQuery } from '@tanstack/react-query'
import { authClient } from '@/lib/auth-client'
import { useUser } from '@/stores/useUser'

interface Balance {
  raw: number
  text: string
  symbol: string
  minimumDepositKes: number
}

export const DEPOSIT_WALLET_BALANCE_QUERY_KEY = 'deposit-wallet-usdc-balance'
export const SLIMEFISH_BACKEND_BALANCE_QUERY_KEY = 'slimefish-ledger-user-balance'

interface UseBalanceOptions {
  enabled?: boolean
  depositWalletAddress?: string | null
}

const INITIAL_STATE: Balance = { raw: 0, text: '0.00', symbol: 'KES', minimumDepositKes: 130 }

export function useBalance(options: UseBalanceOptions = {}) {
  const user = useUser()
  const { data: authSession, isPending: isAuthSessionPending } = authClient.useSession()
  const authenticatedUserId = !isAuthSessionPending && authSession?.user?.id
    ? authSession.user.id
    : user?.id ?? null
  const enabled = Boolean((options.enabled ?? true) && authenticatedUserId)

  const query = useQuery({
    queryKey: [SLIMEFISH_BACKEND_BALANCE_QUERY_KEY, authenticatedUserId],
    enabled,
    staleTime: 1_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const response = await fetch('/api/user/balance', { cache: 'no-store' })
      if (!response.ok) throw new Error('Balance is temporarily unavailable.')
      const payload = await response.json().catch(() => null)
      const available = Number(payload?.data?.available ?? 0)
      const minKes = Number(payload?.data?.minimumDepositKes ?? 130)
      return {
        available: Number.isFinite(available) ? available : 0,
        minimumDepositKes: Number.isFinite(minKes) && minKes > 0 ? minKes : 130,
      }
    },
  })

  const raw = typeof query.data?.available === 'number' && Number.isFinite(query.data.available) ? query.data.available : 0
  const minimumDepositKes = typeof query.data?.minimumDepositKes === 'number' && Number.isFinite(query.data.minimumDepositKes) ? query.data.minimumDepositKes : 130
  const balance = query.data == null
    ? INITIAL_STATE
    : { raw, text: raw.toFixed(2), symbol: 'KES', minimumDepositKes }

  return {
    balance,
    isLoadingBalance: Boolean(enabled && (query.isLoading || (query.data == null && query.isFetching))),
    refetchBalance: query.refetch,
  }
}
