'use client'

import type { WalletDepositModalProps, WalletWithdrawModalProps } from '@/app/[locale]/(platform)/_components/wallet-modal/utils'
import { ChevronLeftIcon } from 'lucide-react'
import { useState } from 'react'
import WalletFundMenu from '@/app/[locale]/(platform)/_components/wallet-modal/WalletFundMenu'
import WalletReceiveView from '@/app/[locale]/(platform)/_components/wallet-modal/WalletReceiveView'
import WalletSendForm from '@/app/[locale]/(platform)/_components/wallet-modal/WalletSendForm'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { useSiteIdentity } from '@/hooks/useSiteIdentity'
import { cn } from '@/lib/utils'

export type { WalletDepositModalProps, WalletWithdrawModalProps }

export function WalletDepositModal(props: WalletDepositModalProps) {
  const {
    open,
    onOpenChange,
    isMobile,
    walletAddress,
    siteName,
    meldUrl,
    hasDeployedDepositWallet,
    view,
    onViewChange,
    onBuy,
    depositWalletBalance,
    isDepositWalletBalanceLoading = false,
    defaultPhoneNumber,
    onrampProgress,
    onOnrampProgressChange,
  } = props

  const [copied, setCopied] = useState(false)
  const site = useSiteIdentity()
  const formattedDepositWalletBalance = depositWalletBalance && depositWalletBalance !== ''
    ? depositWalletBalance
    : '0.00'
  const balanceDisplay = isDepositWalletBalanceLoading
    ? (
        <span className="inline-flex align-middle">
          <span className="h-3 w-12 animate-pulse rounded-md bg-accent" />
        </span>
      )
    : (
        <>
          $
          {formattedDepositWalletBalance}
        </>
      )

  const content = view === 'fund'
    ? (
        <WalletFundMenu
          onBuy={(url) => {
            onBuy(url)
          }}
          onReceive={() => onViewChange('receive')}
          onWallet={() => onViewChange('fund')}
          disabledBuy={!meldUrl}
          disabledReceive={!hasDeployedDepositWallet}
          meldUrl={meldUrl}
          walletAddress={walletAddress}
          defaultPhoneNumber={defaultPhoneNumber}
          onrampProgress={onrampProgress}
          onOnrampProgressChange={onOnrampProgressChange}
        />
      )
      : view === 'receive'
        ? (
            <WalletReceiveView
              walletAddress={walletAddress}
              onCopy={handleCopy}
              copied={copied}
            />
          )
        : (
            <WalletFundMenu
              onBuy={onBuy}
              onReceive={() => onViewChange('receive')}
              onWallet={() => onViewChange('fund')}
              disabledBuy={!meldUrl}
              disabledReceive={!hasDeployedDepositWallet}
              meldUrl={meldUrl}
              walletAddress={walletAddress}
              defaultPhoneNumber={defaultPhoneNumber}
              onrampProgress={onrampProgress}
              onOnrampProgressChange={onOnrampProgressChange}
            />
          )

  async function handleCopy() {
    if (!walletAddress) {
      return
    }
    try {
      await navigator.clipboard.writeText(walletAddress)
      setCopied(true)
      setTimeout(setCopied, 1200, false)
    }
    catch {
      //
    }
  }

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(next) => {
          setCopied(false)
          onOpenChange(next)
        }}
      >
        <DrawerContent className="max-h-[90vh] w-full bg-background px-0">
          <DrawerHeader className="gap-1 px-4 pt-3 pb-2">
            <div className="flex items-center">
              {view !== 'fund'
                ? (
                    <button
                      type="button"
                      className={cn(`
                        rounded-md p-2 opacity-70 ring-offset-background transition
                        hover:bg-muted hover:opacity-100
                        focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden
                        disabled:pointer-events-none
                        [&_svg]:pointer-events-none [&_svg]:shrink-0
                        [&_svg:not([class*='size-'])]:size-4
                      `)}
                      onClick={() => onViewChange('fund')}
                    >
                      <ChevronLeftIcon />
                    </button>
                  )
                : (
                    <span className="size-8" aria-hidden="true" />
                  )}
              <DrawerTitle className="flex-1 text-center text-xl font-semibold text-foreground">Deposit</DrawerTitle>
              <span className="size-8" aria-hidden="true" />
            </div>
            <DrawerDescription className="text-center text-xs text-muted-foreground">
              Balance:
              {' '}
              {balanceDisplay}
            </DrawerDescription>
          </DrawerHeader>
          <div className="border-t" />
          <div className="w-full px-4 pb-4">
            <div className="space-y-4 pt-4">
              {content}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setCopied(false)
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-w-md border bg-background pt-4 sm:max-w-md"
        showCloseButton
      >
        <DialogHeader className="gap-1">
          <div className="flex items-center">
            {view !== 'fund'
              ? (
                  <button
                    type="button"
                    className={cn(`
                      rounded-md p-2 opacity-70 ring-offset-background transition
                      hover:bg-muted hover:opacity-100
                      focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden
                      disabled:pointer-events-none
                      [&_svg]:pointer-events-none [&_svg]:shrink-0
                      [&_svg:not([class*='size-'])]:size-4
                    `)}
                    onClick={() => onViewChange('fund')}
                  >
                    <ChevronLeftIcon />
                  </button>
                )
              : (
                  <span className="size-8" aria-hidden="true" />
                )}
            <DialogTitle className="flex-1 text-center text-lg font-semibold text-foreground">Deposit</DialogTitle>
            <span className="size-8" aria-hidden="true" />
          </div>
          <DialogDescription className="text-center text-xs text-muted-foreground">
            Balance:
            {' '}
            {balanceDisplay}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 border-t" />
        {content}
      </DialogContent>
    </Dialog>
  )
}

export function WalletWithdrawModal(props: WalletWithdrawModalProps) {
  const {
    open,
    onOpenChange,
    isMobile,
    sendTo,
    onChangeSendTo,
    sendAmount,
    onChangeSendAmount,
    isSending,
    isSubmitted,
    error,
    onRetrySend,
    onSubmitSend,
    connectedWalletAddress,
    onUseConnectedWallet,
    availableBalance,
    onMax,
    isBalanceLoading,
    defaultPhoneNumber,
  } = props

  const content = (
    <WalletSendForm
      sendTo={sendTo}
      onChangeSendTo={onChangeSendTo}
      sendAmount={sendAmount}
      onChangeSendAmount={onChangeSendAmount}
      isSending={isSending}
      isSubmitted={isSubmitted}
      error={error}
      onRetrySend={onRetrySend}
      onSubmitSend={onSubmitSend}
      connectedWalletAddress={connectedWalletAddress}
      onUseConnectedWallet={onUseConnectedWallet}
      availableBalance={availableBalance}
      onMax={onMax}
      isBalanceLoading={isBalanceLoading}
      defaultPhoneNumber={defaultPhoneNumber}
    />
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh] w-full bg-background px-0">
          <DrawerHeader className="px-4 pt-4 pb-2">
            <DrawerTitle className="text-center text-foreground">
              Withdraw
            </DrawerTitle>
          </DrawerHeader>
          <div className="w-full px-4 pb-4">
            <div className="space-y-4 pt-4">
              {content}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md border bg-background">
        <DialogHeader>
          <DialogTitle className="text-center text-foreground">
            Withdraw
          </DialogTitle>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
