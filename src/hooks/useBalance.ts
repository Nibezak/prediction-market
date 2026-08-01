import type { Address, PublicClient } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createPublicClient, getContract, http } from 'viem'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
import { useAmmLiveAccount } from '@/hooks/useAmmLiveAccount'
import { authClient } from '@/lib/auth-client'
import { COLLATERAL_TOKEN_ADDRESS } from '@/lib/contracts'
import { defaultViemNetwork, resolveViemRpcUrl } from '@/lib/viem-network'
import { normalizeAddress } from '@/lib/wallet'
import { useUser } from '@/stores/useUser'

interface Balance {
  raw: number
  text: string
  symbol: string
}

export const DEPOSIT_WALLET_BALANCE_QUERY_KEY = 'deposit-wallet-usdc-balance'
export const SLIMEFISH_BACKEND_BALANCE_QUERY_KEY = 'slimefish-ledger-user-balance'

const USDC_DECIMALS = 6
const ERC20_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
]
const INITIAL_STATE: Balance = {
  raw: 0.0,
  text: '0.00',
  symbol: 'USDC',
}

interface UseBalanceOptions {
  enabled?: boolean
  depositWalletAddress?: string | null
}

function createBrowserPublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: defaultViemNetwork,
    transport: http(rpcUrl),
  })
}

export function useBalance(options: UseBalanceOptions = {}) {
  const user = useUser()
  const { data: authSession, isPending: isAuthSessionPending } = authClient.useSession()
  const isSlimefishBackendAmm = process.env.NEXT_PUBLIC_USE_SLIMEFISH_BACKEND_AMM === 'true'
  const authenticatedUserId = !isAuthSessionPending && authSession?.user?.id
    ? authSession.user.id
    : user?.id ?? null
  const liveAccount = useAmmLiveAccount(isSlimefishBackendAmm && Boolean(authenticatedUserId), authenticatedUserId)
  const { polygonRpcUrl } = usePublicRuntimeConfig()
  const rpcUrl = useMemo(() => resolveViemRpcUrl(polygonRpcUrl), [polygonRpcUrl])
  const client = useMemo(
    () => (isSlimefishBackendAmm || typeof window === 'undefined' ? null : createBrowserPublicClient(rpcUrl)),
    [isSlimefishBackendAmm, rpcUrl],
  )

  const sourceDepositWalletAddress = Object.hasOwn(options, 'depositWalletAddress')
    ? options.depositWalletAddress
    : user?.deposit_wallet_address

  const depositWalletAddress: Address | null = sourceDepositWalletAddress
    ? normalizeAddress(sourceDepositWalletAddress) as Address | null
    : null

  const contract = useMemo(() => {
    if (isSlimefishBackendAmm || !client || !depositWalletAddress) {
      return null
    }

    return getContract({
      address: COLLATERAL_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      client,
    })
  }, [client, depositWalletAddress, isSlimefishBackendAmm])

  const isOptionsEnabled = options.enabled ?? true
  const isQueryEnabled = Boolean(isOptionsEnabled && (
    isSlimefishBackendAmm ? false : client && depositWalletAddress
  ))

  const {
    data,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [DEPOSIT_WALLET_BALANCE_QUERY_KEY, isSlimefishBackendAmm ? user?.id : depositWalletAddress],
    enabled: isQueryEnabled,
    staleTime: 'static',
    gcTime: 5 * 60 * 1000,
    refetchInterval: isSlimefishBackendAmm ? false : 10_000,
    refetchIntervalInBackground: !isSlimefishBackendAmm,
    refetchOnWindowFocus: !isSlimefishBackendAmm,
    queryFn: async (): Promise<Balance> => {
      if (!client || !contract || !depositWalletAddress) {
        return INITIAL_STATE
      }

      try {
        const balanceRaw = await contract.read.balanceOf([depositWalletAddress])
        let balanceNumber = Number(balanceRaw) / 10 ** USDC_DECIMALS
        if (Number.isNaN(balanceNumber)) {
          balanceNumber = 0
        }

        return {
          raw: balanceNumber,
          text: balanceNumber.toFixed(2),
          symbol: 'USDC',
        }
      }
      catch {
        return INITIAL_STATE
      }
    },
  })

  const {
    data: slimefishBackendBalance,
    isLoading: isLoadingSlimefishBackendBalance,
    isFetching: isFetchingSlimefishBackendBalance,
    refetch: refetchSlimefishBackendBalance,
  } = useQuery({
    queryKey: [SLIMEFISH_BACKEND_BALANCE_QUERY_KEY, authenticatedUserId],
    enabled: Boolean(isOptionsEnabled && isSlimefishBackendAmm && authenticatedUserId),
    staleTime: 2_000,
    gcTime: 5 * 60 * 1000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<number> => {
      const response = await fetch('/api/amm/users/me/balance', { cache: 'no-store' })
      if (!response.ok) {
        return 0
      }
      const payload = await response.json().catch(() => null)
      const value = payload?.data?.balance?.total ?? payload?.data?.balance ?? 0
      const numeric = Number(value)
      return Number.isFinite(numeric) ? numeric : 0
    },
  })

  const sessionUserBalanceRaw = (authSession?.user as any)?.balance ?? (authSession?.user as any)?.cash
  const storeUserBalanceRaw = (user as any)?.balance ?? (user as any)?.cash
  const hasValidSessionBalance = typeof sessionUserBalanceRaw === 'number' && Number.isFinite(sessionUserBalanceRaw)
  const hasValidStoreBalance = typeof storeUserBalanceRaw === 'number' && Number.isFinite(storeUserBalanceRaw)
  const hasValidQueryBalance = typeof slimefishBackendBalance === 'number' && Number.isFinite(slimefishBackendBalance)
  const hasValidBalance = hasValidStoreBalance || hasValidSessionBalance || hasValidQueryBalance || liveAccount != null

  const rawBalance = liveAccount
    ? liveAccount.balance
    : hasValidQueryBalance
      ? slimefishBackendBalance
      : hasValidStoreBalance
        ? storeUserBalanceRaw
        : hasValidSessionBalance
          ? sessionUserBalanceRaw
          : 0

  const balance = isSlimefishBackendAmm
    ? {
        raw: rawBalance,
        text: rawBalance.toFixed(2),
        symbol: '$',
      }
    : isQueryEnabled && data ? data : INITIAL_STATE

  const isLoadingBalance = isSlimefishBackendAmm
    ? Boolean(isOptionsEnabled && !hasValidBalance && (isAuthSessionPending || isLoadingSlimefishBackendBalance || isFetchingSlimefishBackendBalance) && Boolean(authSession?.user || user))
    : isQueryEnabled ? (isLoading || (!data && isFetching)) : false

  return {
    balance,
    isLoadingBalance,
    refetchBalance: isSlimefishBackendAmm ? refetchSlimefishBackendBalance : refetch,
  }
}
