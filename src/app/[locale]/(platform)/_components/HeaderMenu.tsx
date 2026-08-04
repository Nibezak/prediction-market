'use client'

import { BadgePlusIcon, ChevronDownIcon, WalletIcon } from 'lucide-react'
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
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
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)

  const isAuthenticated = hasHydrated && (Boolean(session?.user) || Boolean(user))
  const shouldShowGuestActions = hasHydrated && !isAuthenticated && !isSessionPending
  const startDepositFlow = tradingOnboarding?.startDepositFlow
  const startWithdrawFlow = tradingOnboarding?.startWithdrawFlow

  const formattedCash = Number.isFinite(balance?.raw)
    ? formatMoney(balance?.raw ?? 0)
    : formatMoney(0)

  function launchWalletFlow(flow?: () => void) {
    setWalletMenuOpen(false)
    window.setTimeout(() => flow?.(), 0)
  }

  return (
    <>
      {isAuthenticated && (
        <>
          {startDepositFlow && (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 bg-transparent hover:bg-transparent"
              onClick={startDepositFlow}
              aria-label={t('Deposit')}
              title={t('Deposit')}
            >
              <BadgePlusIcon className="size-5" strokeWidth={2.25} />
            </Button>
          )}
          {!startDepositFlow && <HeaderDepositButton iconOnly />}
          <DropdownMenu open={walletMenuOpen} onOpenChange={setWalletMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant={isMobile ? 'ghost' : 'secondary'}
                size="headerCompact"
                className={isMobile
                  ? 'h-9 gap-1.5 bg-transparent px-1.5 hover:bg-transparent'
                  : 'h-9 gap-2 px-3'}
                aria-label={`${t('Cash available to trade')}: ${formattedCash}`}
              >
                {!isMobile && <WalletIcon className="size-4 text-muted-foreground" />}
                {isLoadingBalance ? <Skeleton className="h-4 w-14" /> : <span className="text-sm font-semibold tabular-nums">{formattedCash}</span>}
                <ChevronDownIcon className="size-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="bottom"
              sideOffset={8}
              collisionPadding={16}
              sticky="always"
              className="w-64 max-w-[calc(100vw-1rem)]"
            >
              <DropdownMenuLabel className="flex items-center justify-between gap-3 font-normal">
                <span className="text-xs text-muted-foreground">Display currency</span>
                <HeaderCurrencyToggle showBoth />
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild><AppLink href="/portfolio">View portfolio</AppLink></DropdownMenuItem>
              <DropdownMenuItem onSelect={() => launchWalletFlow(startDepositFlow)} disabled={!startDepositFlow}>
                {t('Deposit funds')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => launchWalletFlow(startWithdrawFlow)} disabled={!startWithdrawFlow}>
                {t('Withdraw funds')}
              </DropdownMenuItem>
              {!startDepositFlow && <div className="px-2 py-1"><HeaderDepositButton /></div>}
            </DropdownMenuContent>
          </DropdownMenu>
          {!isMobile && <HeaderNotifications />}
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
