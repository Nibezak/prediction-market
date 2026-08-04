'use client'

import { BadgePercentIcon, BookmarkIcon, ChevronDownIcon, DownloadIcon, InfoIcon, MessageCircleIcon, SettingsIcon, ShieldIcon } from 'lucide-react'
import { useExtracted } from 'next-intl'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useOptionalTradingOnboarding } from '@/app/[locale]/(platform)/_providers/TradingOnboardingContext'
import HeaderNotifications from '@/app/[locale]/(platform)/_components/HeaderNotifications'
import AppLink from '@/components/AppLink'
import LocaleSwitcherMenuItem from '@/components/LocaleSwitcherMenuItem'
import PwaInstallIosInstructions from '@/components/PwaInstallIosInstructions'
import ThemeSelector from '@/components/ThemeSelector'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import UserInfoSection from '@/components/UserInfoSection'
import { useBalance } from '@/hooks/useBalance'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { usePathname } from '@/i18n/navigation'
import { getAvatarPlaceholderStyle, shouldUseAvatarPlaceholder } from '@/lib/avatar'
import { signOutAndRedirect } from '@/lib/logout'
import { cn } from '@/lib/utils'
import { useUser } from '@/stores/useUser'

const HeaderDepositButton = dynamic(
  () => import('@/app/[locale]/(platform)/_components/HeaderDepositButton'),
  { ssr: false },
)

function useHoverMenu(enableHoverOpen: boolean) {
  const [menuOpen, setMenuOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(function clearMenuCloseTimeoutOnUnmount() {
    const timeoutRef = closeTimeoutRef

    return function cleanupMenuCloseTimeout() {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [])

  function relatedTargetIsWithin(ref: React.RefObject<HTMLElement | null>, relatedTarget: EventTarget | null) {
    const current = ref.current
    if (!current) {
      return false
    }

    const nodeConstructor = current.ownerDocument?.defaultView?.Node ?? Node
    if (!(relatedTarget instanceof nodeConstructor)) {
      return false
    }

    return current.contains(relatedTarget)
  }

  function clearCloseTimeout() {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  function handleWrapperPointerEnter() {
    if (!enableHoverOpen) {
      return
    }

    clearCloseTimeout()
    setMenuOpen(true)
  }

  function handleWrapperPointerLeave(event: React.PointerEvent) {
    if (!enableHoverOpen) {
      return
    }

    if (relatedTargetIsWithin(wrapperRef, event.relatedTarget)) {
      return
    }

    clearCloseTimeout()
    closeTimeoutRef.current = setTimeout(() => {
      setMenuOpen(false)
    }, 120)
  }

  function handleMenuClose() {
    setMenuOpen(false)
  }

  return { menuOpen, setMenuOpen, wrapperRef, clearCloseTimeout, handleWrapperPointerEnter, handleWrapperPointerLeave, handleMenuClose }
}

interface HeaderDropdownUserMenuAuthProps {
  displayMode?: 'dropdown' | 'mobile-drawer'
  onHowItWorks?: () => void
}

export default function HeaderDropdownUserMenuAuth({ displayMode = 'dropdown', onHowItWorks }: HeaderDropdownUserMenuAuthProps) {
  const t = useExtracted()
  const user = useUser()
  const pathname = usePathname()
  const isAdmin = pathname.startsWith('/admin')
  const isMobile = useIsMobile()
  const enableHoverOpen = !isMobile
  const { menuOpen, setMenuOpen, wrapperRef, clearCloseTimeout, handleWrapperPointerEnter, handleWrapperPointerLeave, handleMenuClose } = useHoverMenu(enableHoverOpen)
  const avatarUrl = user?.image?.trim() ?? ''
  const avatarSeed = user?.deposit_wallet_address || user?.address || user?.username || 'user'
  const showPlaceholder = shouldUseAvatarPlaceholder(avatarUrl)
  const placeholderStyle = showPlaceholder
    ? getAvatarPlaceholderStyle(avatarSeed)
    : undefined

  const { balance, isLoadingBalance } = useBalance()
  const { formatMoney } = useDisplayCurrency()
  const { canShowInstallUi, isIos, isPrompting, requestInstall } = usePwaInstall()
  const tradingOnboarding = useOptionalTradingOnboarding()
  const startDepositFlow = tradingOnboarding?.startDepositFlow

  async function handleLogout() {
    handleMenuClose()

    try {
      await signOutAndRedirect({
        currentPathname: window.location.pathname,
      })
    }
    catch {
      toast.error(t('Could not log out. Please try again.'))
    }
  }

  async function handleInstallAction() {
    handleMenuClose()

    if (isIos) {
      toast.info(t('Install app'), {
        duration: 10_000,
        description: (
          <PwaInstallIosInstructions className="max-w-sm pt-1" />
        ),
      })
      return
    }

    try {
      await requestInstall()
    }
    catch {
      toast.error(t('An unexpected error occurred. Please try again.'))
    }
  }

  if (!user) {
    return null
  }

  if (displayMode === 'mobile-drawer') {
    return (
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className={cn(`
              flex size-full flex-col items-center justify-center gap-1 px-2 text-[11px] leading-none font-semibold
              text-muted-foreground transition-colors
              focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none
            `)}
            aria-label={t('Profile')}
          >
            {showPlaceholder
              ? <span aria-hidden="true" className="size-[19px] rounded-full" style={placeholderStyle} />
              : <Image src={avatarUrl} alt="" width={19} height={19} className="size-[19px] rounded-full object-cover" />}
            <span>{t('Profile')}</span>
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[calc(100dvh-env(safe-area-inset-top)-0.5rem)] rounded-t-[1.75rem] border-border/70 bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="grid min-h-0 flex-1 gap-4 overflow-x-hidden overflow-y-auto overscroll-contain pt-2 pb-4">
            <div className="rounded-2xl border border-border/70 p-2">
              <UserInfoSection />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3">
              <AppLink href="/portfolio" className="text-lg font-semibold text-yes">
                {isLoadingBalance
                  ? <span className="block h-6 w-20 animate-pulse rounded-md bg-muted" />
                  : (
                      <span>{formatMoney(Number.isFinite(balance?.raw) ? balance?.raw ?? 0 : 0)}</span>
                    )}
              </AppLink>
              {startDepositFlow
                ? <Button size="sm" onClick={startDepositFlow}>{t('Deposit')}</Button>
                : <HeaderDepositButton />}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm font-semibold">{t('Notifications')}</span>
                <HeaderNotifications />
              </div>
              <div className="mx-4 h-px bg-border/70" />
              {user.is_staff && (
                <>
                  <DrawerClose asChild>
                    <AppLink
                      intentPrefetch
                      href="/admin"
                      className="flex items-center gap-3 px-4 py-3 text-sm font-semibold"
                    >
                      <ShieldIcon className="size-4" />
                      {t('Admin')}
                    </AppLink>
                  </DrawerClose>
                  <div className="mx-4 h-px bg-border/70" />
                </>
              )}
              <DrawerClose asChild>
                <AppLink intentPrefetch href="/predictions/trending?bookmarked=true" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold">
                  <BookmarkIcon className="size-4 text-primary" />
                  {t('Bookmarks')}
                </AppLink>
              </DrawerClose>
              <div className="mx-4 h-px bg-border/70" />
              <DrawerClose asChild>
                <AppLink
                  intentPrefetch
                  href="/settings"
                  className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm font-semibold"
                >
                  <SettingsIcon className="size-4 text-orange-500" />
                  {t('Settings')}
                </AppLink>
              </DrawerClose>
              <div className="mx-4 h-px bg-border/70" />
              <DrawerClose asChild>
                <AppLink
                  intentPrefetch
                  href="/settings/affiliate"
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold"
                >
                  <BadgePercentIcon className="size-4 text-emerald-600" />
                  {t('Affiliate')}
                </AppLink>
              </DrawerClose>
            </div>

            <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 px-4 py-3">
              <span className="text-sm font-semibold">{t('Dark Mode')}</span>
              <ThemeSelector />
            </div>

            <div className="overflow-hidden rounded-2xl border border-border/70">
              <DrawerClose asChild>
                <a href="https://chat.whatsapp.com/CbEzxiNuvTS7utAm5TMD05" target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-emerald-500 hover:text-emerald-400">
                  <MessageCircleIcon className="size-4 text-emerald-500" />
                  {t('WhatsApp group')}
                </a>
              </DrawerClose>
              <div className="mx-4 h-px bg-border/70" />
              {canShowInstallUi && (
                <>
                  <DrawerClose asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold"
                      onClick={() => void handleInstallAction()}
                      disabled={isPrompting}
                    >
                      <DownloadIcon className="size-4 text-sky-500" />
                      {t('Install app')}
                    </button>
                  </DrawerClose>
                  <div className="mx-4 h-px bg-border/70" />
                </>
              )}
              <DrawerClose asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-muted-foreground"
                  onClick={() => {
                    if (onHowItWorks) {
                      onHowItWorks()
                      return
                    }
                    const searchParams = new URLSearchParams(window.location.search)
                    searchParams.set('howItWorks', 'true')
                    window.history.pushState(null, '', `?${searchParams.toString()}`)
                    window.dispatchEvent(new Event('popstate'))
                  }}
                >
                  <InfoIcon className="size-4" />
                  {t('How it works')}
                </button>
              </DrawerClose>
              <div className="mx-4 h-px bg-border/70" />
              <DrawerClose asChild>
                <AppLink
                  intentPrefetch
                  href="/tos"
                  className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground"
                >
                  {t('Terms of Use')}
                </AppLink>
              </DrawerClose>
              <div className="mx-4 h-px bg-border/70" />
              <DrawerClose asChild>
                <button type="button" className="w-full px-4 py-3 text-left text-sm font-semibold text-destructive" onClick={() => void handleLogout()}>
                  {t('Logout')}
                </button>
              </DrawerClose>
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <div
      ref={wrapperRef}
      onPointerEnter={enableHoverOpen ? handleWrapperPointerEnter : undefined}
      onPointerLeave={enableHoverOpen ? handleWrapperPointerLeave : undefined}
      className="font-medium"
    >
      <DropdownMenu
        key={isAdmin ? 'admin' : 'platform'}
        open={menuOpen}
        onOpenChange={(nextOpen) => {
          clearCloseTimeout()
          setMenuOpen(nextOpen)
        }}
        modal={false}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="header"
            aria-label="User menu"
            className={cn(`
              group flex cursor-pointer items-center gap-2 px-2 transition-colors
              hover:bg-accent/70 hover:text-accent-foreground
              data-[state=open]:bg-accent/70 data-[state=open]:text-accent-foreground
            `)}
            data-testid="header-menu-button"
          >
            {showPlaceholder
              ? (
                  <div
                    aria-hidden="true"
                    className="aspect-square size-8 shrink-0 rounded-full"
                    style={placeholderStyle}
                  />
                )
              : (
                  <Image
                    src={avatarUrl}
                    alt="User avatar"
                    width={32}
                    height={32}
                    className="aspect-square shrink-0 rounded-full object-cover"
                  />
                )}
            <ChevronDownIcon className={cn(`
              size-4 transition-transform duration-150
              group-hover:rotate-180
              group-data-[state=open]:rotate-180
            `)}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="z-70 w-64"
          align="end"
          sideOffset={0}
          collisionPadding={16}
          portalled={isMobile}
          onInteractOutside={() => setMenuOpen(false)}
          onEscapeKeyDown={() => setMenuOpen(false)}
        >
          <DropdownMenuItem asChild>
            <UserInfoSection />
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {user.is_staff && (
            <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
              <AppLink intentPrefetch href="/admin" className="flex w-full items-center gap-1.5">
                <ShieldIcon className="size-4 text-current" />
                {t('Admin')}
              </AppLink>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
            <AppLink intentPrefetch href="/predictions/trending?bookmarked=true" className="flex w-full items-center gap-1.5">
              <BookmarkIcon className="size-4 text-primary" />
              {t('Bookmarks')}
            </AppLink>
          </DropdownMenuItem>

          <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
            <AppLink intentPrefetch href="/settings" className="flex w-full items-center gap-1.5">
              <SettingsIcon className="size-4 text-orange-500" />
              {t('Settings')}
            </AppLink>
          </DropdownMenuItem>

          <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
            <AppLink intentPrefetch href="/settings/affiliate" className="flex w-full items-center gap-1.5">
              <BadgePercentIcon className="size-4 text-emerald-600" />
              {t('Affiliate')}
            </AppLink>
          </DropdownMenuItem>

          {canShowInstallUi && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-10 cursor-pointer py-2 text-sm font-semibold"
                onSelect={() => {
                  void handleInstallAction()
                }}
                disabled={isPrompting}
              >
                <div className="flex w-full items-center gap-1.5">
                  <DownloadIcon className="size-4 text-sky-500" />
                  {t('Install app')}
                </div>
              </DropdownMenuItem>
            </>
          )}

          {/* <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
            <AppLink
              intentPrefetch
              href="/docs/api-reference"
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center gap-1.5"
            >
              <UnplugIcon className="size-4 text-pink-500" />
              {t('APIs')}
            </AppLink>
          </DropdownMenuItem> */}

          <div className="flex items-center justify-between gap-2 px-2 py-1 text-sm font-semibold">
            <span>{t('Dark Mode')}</span>
            <ThemeSelector />
          </div>

          {isMobile && (
            <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
              <div className="flex w-full items-center justify-between" onClickCapture={handleMenuClose}>
                <AppLink href="/portfolio" className="flex items-center gap-1 text-base font-semibold text-yes">
                  {isLoadingBalance
                    ? <div className="h-5 w-16 animate-pulse rounded-md bg-muted" />
                    : (
                        <span>
                          {formatMoney(Number.isFinite(balance?.raw) ? balance?.raw ?? 0 : 0)}
                        </span>
                      )}
                </AppLink>
                {startDepositFlow
                  ? (
                      <Button size="sm" onClick={startDepositFlow}>
                        {t('Deposit')}
                      </Button>
                    )
                  : (
                      <HeaderDepositButton />
                    )}
              </div>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {/* <DropdownMenuItem asChild className="py-2 text-sm font-semibold text-muted-foreground">
            <AppLink intentPrefetch href="/docs" target="_blank" data-testid="header-docs-link">{t('Documentation')}</AppLink>
          </DropdownMenuItem> */}

          <DropdownMenuItem asChild className="py-2 text-sm font-semibold text-emerald-500 hover:text-emerald-400">
            <a href="https://chat.whatsapp.com/CbEzxiNuvTS7utAm5TMD05" target="_blank" rel="noreferrer" className="flex w-full items-center gap-1.5 text-emerald-500 hover:text-emerald-400">
              <MessageCircleIcon className="size-4 text-emerald-500" />
              {t('WhatsApp group')}
            </a>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="py-2 text-sm font-semibold cursor-pointer text-muted-foreground"
            onSelect={() => {
              handleMenuClose()
              if (onHowItWorks) {
                onHowItWorks()
              } else {
                const searchParams = new URLSearchParams(window.location.search)
                searchParams.set('howItWorks', 'true')
                window.history.pushState(null, '', `?${searchParams.toString()}`)
                window.dispatchEvent(new Event('popstate'))
              }
            }}
          >
            <div className="flex w-full items-center gap-1.5">
              <InfoIcon className="size-4" />
              {t('How it works')}
            </div>
          </DropdownMenuItem>

          <DropdownMenuItem asChild className="py-2 text-sm font-semibold text-muted-foreground">
            <AppLink intentPrefetch href="/tos" data-testid="header-terms-link">{t('Terms of Use')}</AppLink>
          </DropdownMenuItem>

          <LocaleSwitcherMenuItem />

          <DropdownMenuItem asChild className="py-2 text-sm font-semibold">
            <button type="button" className="w-full text-destructive" onClick={() => void handleLogout()}>
              {t('Logout')}
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
