'use client'

import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'
import HeaderDropdownUserMenuGuest from '@/app/[locale]/(platform)/_components/HeaderDropdownUserMenuGuest'
import HeaderNotifications from '@/app/[locale]/(platform)/_components/HeaderNotifications'
import { useOptionalTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import AppLink from '@/components/AppLink'
import HeaderDropdownUserMenuAuth from '@/components/HeaderDropdownUserMenuAuth'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppKit } from '@/hooks/useAppKit'
import { useBalance } from '@/hooks/useBalance'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePortfolioValue } from '@/hooks/usePortfolioValue'
import { authClient } from '@/lib/auth-client'
import { useUser } from '@/stores/useUser'

const { useSession } = authClient

const HeaderDepositButton = dynamic(
  () => import('@/app/[locale]/(platform)/_components/HeaderDepositButton'),
  { ssr: false },
)

export default function HeaderMenu() {
  return <HeaderMenuClient />
}

function HeaderMenuClient() {
  const t = useExtracted()
  const { open } = useAppKit()
  const { data: session, isPending: isSessionPending } = useSession()
  const hasHydrated = useHasHydrated()
  const isMobile = useIsMobile()
  const tradingOnboarding = useOptionalTradingOnboarding()
  const user = useUser()
  const { balance, isLoadingBalance } = useBalance()
  const { isLoading: isLoadingPortfolio, value: positionsValue } = usePortfolioValue()

  const isAuthenticated = hasHydrated && (Boolean(session?.user) || Boolean(user))
  const shouldShowGuestActions = hasHydrated && !isAuthenticated && !isSessionPending
  const startDepositFlow = tradingOnboarding?.startDepositFlow

  const isLoadingValue = isLoadingBalance || isLoadingPortfolio
  const totalBalance = (positionsValue ?? 0) + (balance?.raw ?? 0)
  const formattedBalance = Number.isFinite(totalBalance)
    ? totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00'

  return (
    <>
      {isAuthenticated && (
        <>
          {!isMobile && (
            <div className="flex items-center gap-2 rounded-sm bg-secondary/50 p-2 pr-4">
              <AppLink href="/portfolio" className="flex items-center gap-1 text-base font-semibold text-yes">
                {isLoadingValue
                  ? <Skeleton className="h-5 w-16" />
                  : (
                      <span>
                        $
                        {formattedBalance}
                      </span>
                    )}
              </AppLink>
              {startDepositFlow
                ? (
                    <Button size="headerCompact" onClick={startDepositFlow}>
                      {t('Deposit')}
                    </Button>
                  )
                : (
                    <HeaderDepositButton />
                  )}
            </div>
          )}
          <HeaderNotifications />
          <HeaderDropdownUserMenuAuth />
        </>
      )}

      {shouldShowGuestActions && (
        <>
          <Button
            size="headerCompact"
            data-testid="header-start-trading-button"
            onClick={() => open()}
          >
            {t('Start Trading')}
          </Button>
          <HeaderDropdownUserMenuGuest />
        </>
      )}

      {(!hasHydrated || (!isAuthenticated && !shouldShowGuestActions)) && (
        <Skeleton className="h-8 w-24" />
      )}
    </>
  )
}
