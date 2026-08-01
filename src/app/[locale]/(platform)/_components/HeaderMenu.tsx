'use client'

import { BadgePlusIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import HeaderDropdownUserMenuGuest from '@/app/[locale]/(platform)/_components/HeaderDropdownUserMenuGuest'
import HeaderNotifications from '@/app/[locale]/(platform)/_components/HeaderNotifications'
import { useOptionalTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import AppLink from '@/components/AppLink'
import HeaderCurrencyToggle from '@/components/HeaderCurrencyToggle'
import HeaderDropdownUserMenuAuth from '@/components/HeaderDropdownUserMenuAuth'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppKit } from '@/hooks/useAppKit'
import { useBalance } from '@/hooks/useBalance'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { authClient } from '@/lib/auth-client'
import { useUser } from '@/stores/useUser'

const { useSession } = authClient

const HeaderDepositButton = dynamic(
  () => import('@/app/[locale]/(platform)/_components/HeaderDepositButton'),
  { ssr: false },
)

const HowItWorks = dynamic(
  () => import('@/app/[locale]/(platform)/_components/HowItWorks'),
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
  const { formatMoney } = useDisplayCurrency()
  const [howItWorksOpen, setHowItWorksOpen] = useState(false)

  const isAuthenticated = hasHydrated && (Boolean(session?.user) || Boolean(user))
  const shouldShowGuestActions = hasHydrated && !isAuthenticated && !isSessionPending
  const startDepositFlow = tradingOnboarding?.startDepositFlow

  const formattedCash = Number.isFinite(balance?.raw)
    ? formatMoney(balance?.raw ?? 0)
    : formatMoney(0)

  return (
    <>
      {isAuthenticated && (
        <>
          {!isMobile && (
            <div className="flex items-center gap-2 rounded-sm bg-secondary/50 p-2 pr-4">
              <HeaderCurrencyToggle showBoth />
              <AppLink href="/portfolio" className="flex items-center gap-1 text-base font-semibold text-yes">
                {isLoadingBalance
                  ? <Skeleton className="h-5 w-16" />
                  : (
                      <span>
                        {formattedCash}
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
          {isMobile && (
            <>
              {startDepositFlow
                ? (
                    <Button variant="ghost" size="icon" onClick={startDepositFlow} aria-label={t('Deposit')} title={t('Deposit')}>
                      <BadgePlusIcon className="size-5" strokeWidth={2.25} />
                    </Button>
                  )
                : <HeaderDepositButton iconOnly />}
              {isLoadingBalance
                ? <Skeleton className="h-8 w-16" />
                : (
                    <Button size="headerCompact" asChild>
                      <AppLink
                        href="/portfolio"
                        aria-label={`${t('Cash available to trade')}: ${formattedCash}`}
                        title={t('Cash available to trade')}
                      >
                        {formattedCash}
                      </AppLink>
                    </Button>
                  )}
            </>
          )}
          {isMobile ? <HeaderCurrencyToggle /> : <HeaderNotifications />}
          {!isMobile && <HeaderDropdownUserMenuAuth onHowItWorks={() => setHowItWorksOpen(true)} />}
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

      {howItWorksOpen && (
        <HowItWorks hideTrigger open={howItWorksOpen} onOpenChange={setHowItWorksOpen} />
      )}
    </>
  )
}
