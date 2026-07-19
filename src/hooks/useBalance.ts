import type { Address, PublicClient } from 'viem'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { createPublicClient, getContract, http } from 'viem'
import { usePublicRuntimeConfig } from '@/hooks/usePublicRuntimeConfig'
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
  const isPlayMoneyAmm = process.env.NEXT_PUBLIC_USE_PLAY_MONEY_AMM === 'true'
  const { polygonRpcUrl } = usePublicRuntimeConfig()
  const rpcUrl = useMemo(() => resolveViemRpcUrl(polygonRpcUrl), [polygonRpcUrl])
  const client = useMemo(
    () => (typeof window === 'undefined' ? null : createBrowserPublicClient(rpcUrl)),
    [rpcUrl],
  )

  const sourceDepositWalletAddress = Object.hasOwn(options, 'depositWalletAddress')
    ? options.depositWalletAddress
    : user?.deposit_wallet_address

  const depositWalletAddress: Address | null = sourceDepositWalletAddress
    ? normalizeAddress(sourceDepositWalletAddress) as Address | null
    : null

  const contract = useMemo(() => {
    if (!client || !depositWalletAddress) {
      return null
    }

    return getContract({
      address: COLLATERAL_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      client,
    })
  }, [client, depositWalletAddress])

  const isOptionsEnabled = options.enabled ?? true
  const isQueryEnabled = Boolean(isOptionsEnabled && (
    isPlayMoneyAmm ? user?.id : client && depositWalletAddress
  ))

  const {
    data,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: [DEPOSIT_WALLET_BALANCE_QUERY_KEY, isPlayMoneyAmm ? user?.id : depositWalletAddress],
    enabled: isQueryEnabled,
    staleTime: 'static',
    gcTime: 5 * 60 * 1000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<Balance> => {
      if (isPlayMoneyAmm) {
        try {
          const ammRes = await fetch('/api/amm/users/me/balance', {
            headers: {
              'Content-Type': 'application/json',
            },
          })
          if (ammRes.ok) {
            const ammBody = await ammRes.json()
            if (ammBody?.data?.balance != null) {
              const balanceValue = typeof ammBody.data.balance === 'object'
                ? ammBody.data.balance.total
                : ammBody.data.balance
              let usdcBal = Number(balanceValue)
              if (Number.isNaN(usdcBal)) {
                usdcBal = 0
              }
              return {
                raw: usdcBal,
                text: usdcBal.toFixed(2),
                symbol: 'USDC',
              }
            }
          }
        }
        catch (err) {
          console.error('Failed to fetch AMM balance:', err)
        }
        return INITIAL_STATE
      }

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

  const balance = isQueryEnabled && data ? data : INITIAL_STATE
  const isLoadingBalance = isQueryEnabled ? (isLoading || (!data && isFetching)) : false

  return {
    balance,
    isLoadingBalance,
    refetchBalance: refetch,
  }
}
