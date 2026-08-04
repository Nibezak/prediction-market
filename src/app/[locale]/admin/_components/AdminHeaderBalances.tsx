'use client'

import { useQuery } from '@tanstack/react-query'
import { LandmarkIcon, ReceiptTextIcon, WalletCardsIcon } from 'lucide-react'
import AppLink from '@/components/AppLink'
import HeaderCurrencyToggle from '@/components/HeaderCurrencyToggle'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { hasStaffPermission } from '@/lib/staff-permissions'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { useUser } from '@/stores/useUser'

interface FinanceOverview {
  treasury?: { available?: string | number }
  wallet?: { total?: string | number }
  commissions?: { total?: string | number }
}

const accounts = [
  { key: 'treasury', label: 'Treasury', icon: LandmarkIcon, href: '/admin/finance/treasury' },
  { key: 'wallet', label: 'Wallet', icon: WalletCardsIcon, href: '/admin/finance/wallet' },
  { key: 'commissions', label: 'Commissions', icon: ReceiptTextIcon, href: '/admin/finance/commissions' },
] as const

export default function AdminHeaderBalances() {
  const user = useUser()
  const canViewFinance = hasStaffPermission(user, 'finance.view') || hasStaffPermission(user, 'finance.ledger.view')
  const query = useQuery({
    queryKey: ['admin-finance-overview'],
    enabled: canViewFinance,
    staleTime: 2_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    queryFn: async (): Promise<FinanceOverview> => {
      const response = await fetch('/api/amm/admin/finance/overview', { cache: 'no-store' })
      if (!response.ok) {
        throw new Error('Finance balances are unavailable.')
      }
      const payload = await response.json().catch(() => null)
      return payload?.data ?? {}
    },
  })

  if (!canViewFinance) {
    return null
  }

  const values = {
    treasury: Number(query.data?.treasury?.available ?? 0),
    wallet: Number(query.data?.wallet?.total ?? 0),
    commissions: Number(query.data?.commissions?.total ?? 0),
  }

  // The API returns values in KES, but formatMoney expects USD
  // For admin dashboard, we should display the raw values with KES symbol
  function formatKESMoney(value: number) {
    return `KES ${value.toLocaleString('en-KE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  }

  return (
    <div className="flex items-center gap-1">
      <HeaderCurrencyToggle showBoth />
      {accounts.map(({ key, label, icon: Icon, href }) => (
        <Button
          key={key}
          variant="ghost"
          size="header"
          className="flex h-11 flex-col items-start justify-center gap-0.5 rounded-md px-2.5 py-1"
          asChild
        >
          <AppLink href={href as any}>
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Icon className="size-3.5" />
              {label}
            </span>
            {query.isLoading
              ? <Skeleton className="h-4 w-14" />
              : <span className="text-sm font-semibold tabular-nums text-foreground">{formatKESMoney(values[key])}</span>}
          </AppLink>
        </Button>
      ))}
    </div>
  )
}
